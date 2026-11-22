"""Pure candidate partitioning, size-band assignment, and gate probe selection (Stage 6A, D-401)."""

from collections.abc import Awaitable, Callable
from typing import Any

import structlog

from archnemesis.modules.models.schemas import ModelSuggestionItem, ProbeResult, SizeBand

logger = structlog.get_logger(__name__)


def _sanitize_string(val: Any) -> str:
    """Extract string value without altering hostile strings or executing scripts."""
    if val is None:
        return ""
    return str(val).strip()


def partition_candidates(
    raw_models: list[dict[str, Any]],
    tag: str,
    small_max_params: int = 3_000_000_000,
    medium_max_params: int = 10_000_000_000,
) -> list[ModelSuggestionItem]:
    """Filter raw ModelFit catalogue items and build prioritized candidate sequence.

    Rules:
    - Drop items where gated != False (strict: True, "manual", etc. are dropped).
    - Drop items with missing/empty author, model_name, or id.
    - Classify total_params into small (< small_max), medium (small_max..medium_max), large (> medium_max).
    - Unknown total_params is labelled UNKNOWN and used strictly as fill.
    - Each band sorted by downloads desc, likes desc, id asc (deterministic).
    - Prioritized sequence: 1 top small, 1 top medium, 1 top large; followed by remaining candidates
      ordered by downloads desc.
    """
    valid_items: list[ModelSuggestionItem] = []

    for raw in raw_models:
        if not isinstance(raw, dict):
            continue

        # Strict gated check: must be strictly boolean False
        if raw.get("gated") is not False:
            continue

        repo_id = _sanitize_string(raw.get("id"))
        author = _sanitize_string(raw.get("author"))
        model_name = _sanitize_string(raw.get("model_name"))

        if not repo_id or not author or not model_name:
            continue

        raw_params = raw.get("total_params")
        total_params: int | None = None
        if isinstance(raw_params, int) and raw_params > 0:
            total_params = raw_params

        # Classify size band
        size_band: SizeBand
        if total_params is None:
            size_band = SizeBand.UNKNOWN
        elif total_params < small_max_params:
            size_band = SizeBand.SMALL
        elif total_params <= medium_max_params:
            size_band = SizeBand.MEDIUM
        else:
            size_band = SizeBand.LARGE

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
                total_params=total_params,
                size_band=size_band,
                downloads=downloads_val,
                likes=likes_val,
            )
        )

    # Sort key: downloads desc, likes desc, id asc for determinism
    def sort_key(item: ModelSuggestionItem) -> tuple[int, int, str]:
        return (-item.downloads, -item.likes, item.id)

    small_band = sorted([i for i in valid_items if i.size_band == SizeBand.SMALL], key=sort_key)
    medium_band = sorted([i for i in valid_items if i.size_band == SizeBand.MEDIUM], key=sort_key)
    large_band = sorted([i for i in valid_items if i.size_band == SizeBand.LARGE], key=sort_key)
    unknown_band = sorted([i for i in valid_items if i.size_band == SizeBand.UNKNOWN], key=sort_key)

    chosen_lead_ids: set[str] = set()
    leads: list[ModelSuggestionItem] = []

    if small_band:
        leads.append(small_band[0])
        chosen_lead_ids.add(small_band[0].id)
    if medium_band:
        leads.append(medium_band[0])
        chosen_lead_ids.add(medium_band[0].id)
    if large_band:
        leads.append(large_band[0])
        chosen_lead_ids.add(large_band[0].id)

    # Remaining candidate pool (all remaining known band items + all unknown items)
    remaining_pool: list[ModelSuggestionItem] = []
    for item in small_band[1:] + medium_band[1:] + large_band[1:] + unknown_band:
        if item.id not in chosen_lead_ids:
            remaining_pool.append(item)

    remaining_pool.sort(key=sort_key)

    # Combined prioritized candidate order
    prioritized_candidates = leads + remaining_pool
    return prioritized_candidates


async def select_model_suggestions(
    candidates: list[ModelSuggestionItem],
    probe_fn: Callable[[str], Awaitable[ProbeResult]],
    max_probes: int = 6,
    target_count: int = 3,
) -> list[ModelSuggestionItem]:
    """Walk prioritized candidate sequence, probe accessibility, and select up to target_count open models.

    Rules:
    - Asks probe_fn(candidate.id).
    - If ProbeResult.OPEN: accepted.
    - If ProbeResult.GATED: rejected, advances to next candidate.
    - If ProbeResult.UNKNOWN: never counted as open, advances to next candidate.
    - Stops when target_count models are collected or max_probes is reached.
    - Returns whatever open models were found (fewer than target_count if catalogue is exhausted;
      never invents fake model names).
    """
    accepted: list[ModelSuggestionItem] = []
    probes_executed = 0

    for candidate in candidates:
        if len(accepted) >= target_count:
            break
        if probes_executed >= max_probes:
            break

        probes_executed += 1
        probe_result = await probe_fn(candidate.id)

        if probe_result == ProbeResult.OPEN:
            accepted.append(candidate)
            logger.info(
                "model_candidate_accepted",
                repo_id=candidate.id,
                size_band=candidate.size_band.value,
            )
        elif probe_result == ProbeResult.GATED:
            logger.info("model_candidate_rejected_gated", repo_id=candidate.id)
        else:
            logger.info(
                "model_candidate_rejected_unknown", repo_id=candidate.id, result=probe_result.value
            )

    logger.info(
        "model_selection_complete",
        candidates_count=len(candidates),
        probes_executed=probes_executed,
        accepted_count=len(accepted),
    )
    return accepted
