"""Service layer for lazy model suggestions generation and caching (Stage 6B, D-404)."""

import json
from typing import Literal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import AppError, NodeNotAIError, NotFoundError
from archnemesis.llm.base import LLMClient, LLMTask
from archnemesis.modules.models import repo
from archnemesis.modules.models.client import ModelFitClient, ModelFitUnavailable
from archnemesis.modules.models.schemas import (
    ModelSuggestionItem,
    ModelSuggestionItemResponse,
    ModelSuggestionsResponse,
    ModelTagOutput,
)
from archnemesis.modules.models.selection import partition_candidates, select_model_suggestions
from archnemesis.modules.models.tags import (
    CLOSED_PIPELINE_TAGS,
    fallback_pipeline_tag,
)
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.prompts import load_prompt
from archnemesis.settings import Settings, get_settings

logger = structlog.get_logger(__name__)

MODELS_TAG_PROMPT_NAME: str = "models_tag_v1"


def _escape_untrusted_text(text: str) -> str:
    """Escape fake closing tags to prevent prompt injection."""
    return text.replace("</untrusted_user_text>", "&lt;/untrusted_user_text&gt;")


def _format_response(
    status: Literal["ok", "unavailable", "empty"],
    task_tag: str | None,
    items: list[ModelSuggestionItem],
    message: str | None = None,
) -> ModelSuggestionsResponse:
    """Build response envelope with internal /models routes."""
    response_items: list[ModelSuggestionItemResponse] = []

    for item in items:
        details_url = f"/models/{item.id}"
        browse_url = "/models"

        response_items.append(
            ModelSuggestionItemResponse(
                id=item.id,
                author=item.author,
                model_name=item.model_name,
                task_tag=item.task_tag,
                total_params=item.total_params,
                size_band=item.size_band,
                downloads=item.downloads,
                likes=item.likes,
                details_url=details_url,
                browse_url=browse_url,
            )
        )

    return ModelSuggestionsResponse(
        status=status,
        task_tag=task_tag,
        items=response_items,
        message=message,
    )


async def get_or_generate_model_suggestions(
    db: AsyncSession,
    llm: LLMClient,
    design_id: str,
    version_no: int,
    node_id: str,
    settings: Settings | None = None,
    client: ModelFitClient | None = None,
) -> ModelSuggestionsResponse:
    """Retrieve cached suggestions or lazily generate recommendations for an AI node.

    Guards:
    - 404 if design, version, or node does not exist.
    - 400 NODE_NOT_AI if the node is not an AI node (needs_model false and ai_role none).
    - Returns cached record if present, making 0 LLM and 0 ModelFit calls.
    - If ModelFit is unconfigured or unavailable, returns status 'unavailable' without saving.
    """
    if settings is None:
        settings = get_settings()

    # 1. Fetch design
    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    # 2. Fetch design version
    version = await repo.get_design_version(db, design_id, version_no)
    if version is None:
        raise NotFoundError(f"Design version {version_no} for design '{design_id}' not found.")

    # 3. Locate target node in specification
    spec = ArchitectureSpec.model_validate(json.loads(version.spec_json))
    target_node = next((n for n in spec.nodes if n.id == node_id), None)
    if target_node is None:
        raise NotFoundError(f"Node '{node_id}' not found in design version {version_no}.")

    # 4. Enforce AI node check (needs_model true OR ai_role not none)
    is_ai = bool(target_node.needs_model or (target_node.ai_role and target_node.ai_role != "none"))
    if not is_ai:
        raise NodeNotAIError(f"Node '{node_id}' does not use an AI model.")

    # 5. Check database cache
    cached = await repo.get_model_suggestions(db, design_id, version_no, node_id)
    if cached is not None:
        logger.info(
            "models_cache_hit",
            design_id=design_id,
            version_no=version_no,
            node_id=node_id,
            tag=cached.task_tag,
        )
        stored_raw = json.loads(cached.suggestions_json)
        cached_items = [ModelSuggestionItem.model_validate(x) for x in stored_raw]
        return _format_response(
            status="ok",
            task_tag=cached.task_tag,
            items=cached_items,
        )

    # 6. LLM Task-Tag Classification
    system_prompt = load_prompt(f"{MODELS_TAG_PROMPT_NAME}.md")
    tools_str = ", ".join(target_node.tools) if target_node.tools else "none"
    user_prompt = (
        "<untrusted_user_text>\n"
        f"node_name: {_escape_untrusted_text(target_node.name)}\n"
        f"role: {_escape_untrusted_text(target_node.role)}\n"
        f"ai_role: {target_node.ai_role or 'none'}\n"
        f"tools: {_escape_untrusted_text(tools_str)}\n"
        "</untrusted_user_text>\n"
        "Select the most appropriate pipeline_tag."
    )

    tag_val: str | None = None
    try:
        raw_output = await llm.generate_json(
            task=LLMTask.MODELS,
            system=system_prompt,
            user=user_prompt,
            schema=ModelTagOutput,
        )
        candidate_tag = raw_output.get("task_tag")
        if candidate_tag in CLOSED_PIPELINE_TAGS:
            tag_val = candidate_tag
    except Exception as exc:  # noqa: BLE001
        logger.info(
            "models_llm_tag_failed",
            design_id=design_id,
            node_id=node_id,
            error=exc.__class__.__name__,
        )

    if tag_val is None:
        tag_val = fallback_pipeline_tag(role=target_node.role, ai_role=target_node.ai_role).value
        logger.info(
            "models_tag_fallback_applied",
            design_id=design_id,
            node_id=node_id,
            tag=tag_val,
        )

    # 7. Query ModelFit Catalogue and Probe Gate Status
    if client is not None:
        try:
            raw_models = await client.list_models(tag=tag_val)
            candidates = partition_candidates(
                raw_models,
                tag=tag_val,
            )
            selected = await select_model_suggestions(
                candidates,
                probe_fn=client.probe_model_open,
                max_probes=settings.max_gate_probes_per_node,
                target_count=3,
                small_max_params=settings.model_size_small_max_params,
                medium_max_params=settings.model_size_medium_max_params,
            )
        except ModelFitUnavailable as exc:
            logger.warning(
                "models_fetch_unavailable",
                design_id=design_id,
                node_id=node_id,
                reason=str(exc),
            )
            return ModelSuggestionsResponse(
                status="unavailable",
                task_tag=tag_val,
                items=[],
                message="Model suggestions are not available right now.",
            )
    else:
        from archnemesis.modules.modelfit.catalog.service import CatalogService
        from archnemesis.modules.models.schemas import ModelProbeDetail, ProbeResult

        cat_service = CatalogService()
        try:
            catalog_res = await cat_service.list_models(
                session=db,
                pipeline_tag=tag_val,
                limit=50,
            )
            raw_models = [m.model_dump() for m in catalog_res.items]
            candidates = partition_candidates(raw_models, tag=tag_val)

            async def in_proc_probe(r_id: str) -> ModelProbeDetail:
                try:
                    d = await cat_service.get_model_detail(db, r_id)
                    s = ProbeResult.OPEN if not d.gated else ProbeResult.GATED
                    tp = d.normalized_model.total_params if d.normalized_model else None
                    return ModelProbeDetail(status=s, total_params=tp)
                except (AppError, ValueError, KeyError):
                    return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)

            selected = await select_model_suggestions(
                candidates,
                probe_fn=in_proc_probe,
                max_probes=settings.max_gate_probes_per_node,
                target_count=3,
                small_max_params=settings.model_size_small_max_params,
                medium_max_params=settings.model_size_medium_max_params,
            )
        except (AppError, ValueError, KeyError) as exc:
            logger.warning(
                "models_fetch_unavailable",
                design_id=design_id,
                node_id=node_id,
                reason=str(exc),
            )
            return ModelSuggestionsResponse(
                status="unavailable",
                task_tag=tag_val,
                items=[],
                message="Model suggestions are not available right now.",
            )

    # 9. Handle Empty Results (do not persist empty responses)
    if not selected:
        logger.info(
            "models_empty_results",
            design_id=design_id,
            node_id=node_id,
            tag=tag_val,
        )
        return _format_response(
            status="empty",
            task_tag=tag_val,
            items=[],
            message="No suitable models found.",
        )

    # 9. Persist Successful Recommendations (status 'ok' only)
    await repo.save_model_suggestions(
        db=db,
        design_id=design_id,
        version_no=version_no,
        node_id=node_id,
        task_tag=tag_val,
        items=selected,
    )
    logger.info(
        "models_saved",
        design_id=design_id,
        version_no=version_no,
        node_id=node_id,
        tag=tag_val,
        count=len(selected),
    )

    return _format_response(
        status="ok",
        task_tag=tag_val,
        items=selected,
    )
