"""Service layer for architecture design generation, persistence, and retrieval."""

import hashlib
import json
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import NotFoundError, NotReadyError
from archnemesis.llm.base import LLMClient
from archnemesis.modules.architect import service as architect_service
from archnemesis.modules.architect.service import ARCHITECT_PROMPT_NAME
from archnemesis.modules.designs import repo
from archnemesis.modules.designs.schemas import CreateDesignRequest, DesignResponse
from archnemesis.modules.designs.title import (
    fallback_title,
    generate_title_for_design,
)
from archnemesis.modules.explainer.schemas import Explanation
from archnemesis.modules.intake import repo as intake_repo
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    Limits,
    ValidationResult,
)
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.modules.validation.validate import validate
from archnemesis.settings import get_settings
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger(__name__)

SPEC_CACHE_TTL_DAYS: int = 7


def compute_spec_cache_key(
    brief: RequirementBrief,
    prompt_version: str,
    architect_model: str,
) -> str:
    """Compute deterministic SHA-256 cache key from canonical JSON of brief, prompt version, and model."""
    brief_dict = brief.model_dump(by_alias=True)
    canonical_brief_json = json.dumps(brief_dict, sort_keys=True, separators=(",", ":"))
    raw = f"{canonical_brief_json}|{prompt_version}|{architect_model}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def create_design(
    db: AsyncSession,
    request: CreateDesignRequest,
    llm: LLMClient,
) -> DesignResponse:
    # 1. Retrieve session
    session = await intake_repo.get_session(db, request.session_id)
    if session is None:
        raise NotFoundError(f"Intake session '{request.session_id}' not found.")

    # 2. Check if design already exists for this session
    existing_design = await repo.get_design_by_session_id(db, request.session_id)
    if existing_design is not None:
        version = await repo.get_design_version(db, existing_design.id, 1)
        if version is not None:
            brief_dict = json.loads(version.brief_json)
            brief_obj = RequirementBrief.model_validate(brief_dict)
            warnings_list = json.loads(version.warnings_json)
            spec_dict = json.loads(version.spec_json)
            existing_spec = ArchitectureSpec.model_validate(spec_dict)
            flow_order = order_nodes(existing_spec)
            existing_explanation: Explanation | None = None
            if version.explanation_json is not None:
                existing_explanation = Explanation.model_validate(
                    json.loads(version.explanation_json)
                )
            resolved_title = existing_design.title or fallback_title(
                brief_obj.summary, brief_obj.domain_hint
            )
            return DesignResponse(
                id=existing_design.id,
                intake_session_id=existing_design.intake_session_id,
                title=resolved_title,
                current_version=version.version_no,
                brief=brief_obj,
                spec=existing_spec,
                warnings=warnings_list,
                flow_order=flow_order,
                prompt_version=version.prompt_version,
                explanation=existing_explanation,
            )

    # 3. Check readiness
    if session.status != "ready":
        raise NotReadyError("Intake session is not ready for design generation.")

    if not session.brief_json:
        raise NotReadyError("Intake session is missing requirement brief.")

    brief_dict = json.loads(session.brief_json)
    brief = RequirementBrief.model_validate(brief_dict)

    # 4. Check spec cache before invoking LLM
    settings = get_settings()
    architect_model = settings.llm_model_architect or ""
    base_prompt_version = ARCHITECT_PROMPT_NAME
    cache_key = compute_spec_cache_key(brief, base_prompt_version, architect_model)

    cached_entry = await repo.get_cached_spec(db, cache_key)
    spec: ArchitectureSpec
    prompt_version: str
    val_res: ValidationResult | None = None
    is_cache_hit = False

    if cached_entry is not None:
        try:
            created_at_dt = datetime.fromisoformat(cached_entry.created_at)
            if created_at_dt.tzinfo is None:
                created_at_dt = created_at_dt.replace(tzinfo=UTC)
            now_dt = datetime.now(UTC)
            if now_dt - created_at_dt <= timedelta(days=SPEC_CACHE_TTL_DAYS):
                is_cache_hit = True
                cached_spec_dict = json.loads(cached_entry.spec_json)
                spec = ArchitectureSpec.model_validate(cached_spec_dict)
                limits = Limits(max_nodes=settings.max_nodes, max_edges=settings.max_edges)
                brief_constraints = {c.id: c.text for c in brief.stated_constraints}
                val_res = validate(spec, brief_constraints=brief_constraints, limits=limits)
                prompt_version = f"{base_prompt_version} (cached)"
            else:
                # Expired: remove and treat as miss
                await repo.delete_cached_spec(db, cache_key)
        except (ValueError, TypeError, json.JSONDecodeError):
            await repo.delete_cached_spec(db, cache_key)

    if is_cache_hit:
        logger.info(
            "spec_cache_event",
            cache_hit=True,
            key_prefix=cache_key[:8],
            node_count=len(spec.nodes),
            prompt_version=prompt_version,
        )
    else:
        # Commit session so no DB connection/transaction is held open across the LLM call
        await db.commit()
        spec, prompt_version, _, val_res = await architect_service.generate_and_validate(brief, llm)
        logger.info(
            "spec_cache_event",
            cache_hit=False,
            key_prefix=cache_key[:8],
            node_count=len(spec.nodes),
            prompt_version=prompt_version,
        )
        # Store in spec cache only after successful validation
        await repo.set_cached_spec(
            db=db,
            key=cache_key,
            spec_dict=spec.model_dump(by_alias=True),
        )

    # 5. Save design and version 1 with concurrency protection
    models_dict = {"architect": architect_model}

    try:
        warnings_to_store = [w.message for w in val_res.warnings] if val_res else []
        design, version = await repo.create_design(
            db=db,
            session_id=request.session_id,
            brief_dict=brief.model_dump(by_alias=True),
            spec_dict=spec.model_dump(by_alias=True),
            prompt_version=prompt_version,
            models_dict=models_dict,
            warnings=warnings_to_store,
        )
        logger.info(
            "design_created",
            design_id=design.id,
            node_count=len(spec.nodes),
            prompt_version=prompt_version,
            models=list(models_dict.values()),
        )
        await intake_repo.update_session_status(db, request.session_id, "designed")
    except IntegrityError:
        # Race condition on UNIQUE(intake_session_id)
        await db.rollback()
        design_match = await repo.get_design_by_session_id(db, request.session_id)
        if design_match is None:
            raise
        design = design_match
        version_match = await repo.get_design_version(db, design.id, 1)
        if version_match is None:
            raise
        version = version_match
        spec = ArchitectureSpec.model_validate(json.loads(version.spec_json))
        prompt_version = version.prompt_version

    brief_dict = json.loads(version.brief_json)
    brief_obj = RequirementBrief.model_validate(brief_dict)
    warnings_list = json.loads(version.warnings_json)
    flow_order = order_nodes(spec)

    # 6. Generate concise title post-save (single attempt, 3s timeout, no retry)
    if not getattr(design, "title", None):
        title, source, issue = await generate_title_for_design(design.id, brief_obj, llm)
        logger.info("design_title_generated", design_id=design.id, source=source, issue=issue)
        try:
            await repo.update_design_title(db, design.id, title)
            design.title = title
        except Exception:  # noqa: BLE001 - DB title update failure must never fail design creation
            logger.warning("design_title_db_update_failed", design_id=design.id)

    resolved_title = design.title or fallback_title(brief_obj.summary, brief_obj.domain_hint)
    return DesignResponse(
        id=design.id,
        intake_session_id=design.intake_session_id,
        title=resolved_title,
        current_version=version.version_no,
        brief=brief_obj,
        spec=spec,
        warnings=warnings_list,
        flow_order=flow_order,
        prompt_version=prompt_version,
    )


async def get_design(db: AsyncSession, design_id: str) -> DesignResponse:
    design = await repo.get_design_by_id(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    version = await repo.get_design_version(db, design.id, design.current_version)
    if version is None:
        raise NotFoundError(
            f"Design version {design.current_version} for design '{design_id}' not found."
        )

    brief_dict = json.loads(version.brief_json)
    brief_obj = RequirementBrief.model_validate(brief_dict)
    warnings_list = json.loads(version.warnings_json)
    spec = ArchitectureSpec.model_validate(json.loads(version.spec_json))
    flow_order = order_nodes(spec)

    explanation_obj: Explanation | None = None
    if version.explanation_json is not None:
        explanation_obj = Explanation.model_validate(json.loads(version.explanation_json))

    resolved_title = design.title or fallback_title(brief_obj.summary, brief_obj.domain_hint)
    return DesignResponse(
        id=design.id,
        intake_session_id=design.intake_session_id,
        title=resolved_title,
        current_version=version.version_no,
        brief=brief_obj,
        spec=spec,
        warnings=warnings_list,
        flow_order=flow_order,
        prompt_version=version.prompt_version,
        explanation=explanation_obj,
    )


async def get_design_titles(db: AsyncSession, design_ids: list[str]) -> dict[str, str]:
    """Resolve concise titles for requested design IDs in a single query, omitting unknown IDs."""
    if not design_ids:
        return {}

    unique_ids = list(dict.fromkeys(design_ids))
    rows = await repo.get_design_titles_batch(db, unique_ids)

    titles: dict[str, str] = {}
    for design_id, stored_title, brief_json in rows:
        if stored_title:
            titles[design_id] = stored_title
        elif brief_json:
            try:
                brief_dict = json.loads(brief_json)
                summary = brief_dict.get("summary", "")
                domain_hint = brief_dict.get("domain_hint", "")
                titles[design_id] = fallback_title(summary, domain_hint)
            except Exception:  # noqa: BLE001
                titles[design_id] = "Untitled Design"
        else:
            titles[design_id] = "Untitled Design"

    return titles
