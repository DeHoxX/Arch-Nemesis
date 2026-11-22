"""Pure candidate partitioning, size-band assignment, and gate probe selection (Stage 6A, D-401)."""

from collections.abc import Awaitable, Callable
from typing import Any

import structlog

from archnemesis.modules.models.schemas import (
    ModelProbeDetail,
    ModelSuggestionItem,
    ProbeResult,
    SizeBand,
)

logger = structlog.get_logger(__name__)


def _sanitize_string(val: Any) -> str:
    """Extract string value without altering hostile strings or executing scripts."""
    if val is None:
        return ""
    return str(val).strip()


def classify_size_band(
    total_params: int | None,
    small_max_params: int = 3_000_000_000,
    medium_max_params: int = 10_000_000_000,
) -> SizeBand:
    """Classify total_params into SizeBand strictly based on numeric value."""
    if total_params is None:
        return SizeBand.UNKNOWN
    if total_params < small_max_params:
        return SizeBand.SMALL
    if total_params <= medium_max_params:
        return SizeBand.MEDIUM
    return SizeBand.LARGE


def partition_candidates(
    raw_models: list[dict[str, Any]],
    tag: str,
) -> list[ModelSuggestionItem]:
    """Filter raw ModelFit catalogue items and order by downloads desc.

    Note: The list endpoint returns total_params: null for all models.
    Candidates here start with total_params=None and size_band=SizeBand.UNKNOWN.
    Size bands and parameter counts are discovered strictly upon probing the detail endpoint.

    Rules:
    - Drop items where gated != False (strict boolean check).
    - Drop items with missing/empty author, model_name, or id.
    - Deterministic order: downloads desc, likes desc, id asc.
    """
    valid_items: list[ModelSuggestionItem] = []

    for raw in raw_models:
        if not isinstance(raw, dict):
            continue

        if raw.get("gated") is not False:
            continue

        repo_id = _sanitize_string(raw.get("id"))
        author = _sanitize_string(raw.get("author"))
        model_name = _sanitize_string(raw.get("model_name"))

        if not repo_id or not author or not model_name:
            continue

        downloads = raw.get("downloads", 0)
        likes = raw.get("likes", 0)
        downloads_val = int(downloads) if isinstance(downloads, int | float) else 0
        likes_val = int(likes) if isinstance(likes, int | float) else 0

        valid_items.append(
            ModelSuggestionItem(
                id=repo_id,
                author=author,
                model_name=model_name,
                task_tag=tag,
                total_params=None,
                size_band=SizeBand.UNKNOWN,
                downloads=downloads_val,
                likes=likes_val,
            )
        )

    # Sort key: downloads desc, likes desc, id asc for determinism
    valid_items.sort(key=lambda item: (-item.downloads, -item.likes, item.id))
    return valid_items


async def select_model_suggestions(
    candidates: list[ModelSuggestionItem],
    probe_fn: Callable[[str], Awaitable[ModelProbeDetail]],
    max_probes: int = 6,
    target_count: int = 3,
    small_max_params: int = 3_000_000_000,
    medium_max_params: int = 10_000_000_000,
) -> list[ModelSuggestionItem]:
    """Probe candidates in downloads order up to max_probes, and select up to target_count.

    Rules (Stage 6B2, D-406):
    1. Probes candidates in download order up to max_probes (default 6).
    2. Drops gated and unknown results (only ProbeResult.OPEN is retained).
    3. For open models, assigns total_params and size_band strictly from detail probe's
       normalized_model.total_params.
    4. From the probed open models, attempts to pick one small, one medium, and one large.
    5. Fills any remaining slots up to target_count from the remaining open models in download order.
    6. Never shows a band without real params (no params -> SizeBand.UNKNOWN).
    7. Returns whatever open models were found (never invents fake model names or params).
    """
    open_models: list[ModelSuggestionItem] = []
    probes_executed = 0

    for candidate in candidates:
        if probes_executed >= max_probes:
            break

        probes_executed += 1
        probe_detail = await probe_fn(candidate.id)

        if probe_detail.status == ProbeResult.OPEN:
            total_params = probe_detail.total_params
            size_band = classify_size_band(
                total_params=total_params,
                small_max_params=small_max_params,
                medium_max_params=medium_max_params,
            )
            item = ModelSuggestionItem(
                id=candidate.id,
                author=candidate.author,
                model_name=candidate.model_name,
                task_tag=candidate.task_tag,
                total_params=total_params,
                size_band=size_band,
                downloads=candidate.downloads,
                likes=candidate.likes,
            )
            open_models.append(item)
            logger.info(
                "model_candidate_accepted",
                repo_id=item.id,
                size_band=item.size_band.value,
                total_params=total_params,
            )
        elif probe_detail.status == ProbeResult.GATED:
            logger.info("model_candidate_rejected_gated", repo_id=candidate.id)
        else:
            logger.info(
                "model_candidate_rejected_unknown",
                repo_id=candidate.id,
                status=probe_detail.status.value,
            )

    # Pick one small, one medium, one large from open models if available
    selected: list[ModelSuggestionItem] = []
    chosen_ids: set[str] = set()

    small_cand = next((m for m in open_models if m.size_band == SizeBand.SMALL), None)
    if small_cand and len(selected) < target_count:
        selected.append(small_cand)
        chosen_ids.add(small_cand.id)

    med_cand = next(
        (m for m in open_models if m.size_band == SizeBand.MEDIUM and m.id not in chosen_ids), None
    )
    if med_cand and len(selected) < target_count:
        selected.append(med_cand)
        chosen_ids.add(med_cand.id)

    large_cand = next(
        (m for m in open_models if m.size_band == SizeBand.LARGE and m.id not in chosen_ids), None
    )
    if large_cand and len(selected) < target_count:
        selected.append(large_cand)
        chosen_ids.add(large_cand.id)

    # Fill remaining slots up to target_count from remaining open models in download order
    for m in open_models:
        if len(selected) >= target_count:
            break
        if m.id not in chosen_ids:
            selected.append(m)
            chosen_ids.add(m.id)

    logger.info(
        "model_selection_complete",
        candidates_count=len(candidates),
        probes_executed=probes_executed,
        open_models_count=len(open_models),
        selected_count=len(selected),
    )
    return selected
