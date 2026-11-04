"""Service layer for architecture design generation, persistence, and retrieval."""

import json

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import NotFoundError, NotReadyError
from archnemesis.llm.base import LLMClient
from archnemesis.modules.architect import service as architect_service
from archnemesis.modules.designs import repo
from archnemesis.modules.designs.schemas import CreateDesignRequest, DesignResponse
from archnemesis.modules.explainer.schemas import Explanation
from archnemesis.modules.intake import repo as intake_repo
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.settings import get_settings
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger()


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
            spec = ArchitectureSpec.model_validate(spec_dict)
            flow_order = order_nodes(spec)
            existing_explanation: Explanation | None = None
            if version.explanation_json is not None:
                existing_explanation = Explanation.model_validate(
                    json.loads(version.explanation_json)
                )
            return DesignResponse(
                id=existing_design.id,
                intake_session_id=existing_design.intake_session_id,
                current_version=version.version_no,
                brief=brief_obj,
                spec=spec,
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

    # 4. Generate architecture via architect service
    spec, prompt_version, _, val_res = await architect_service.generate_and_validate(brief, llm)

    # 5. Save design and version 1 with concurrency protection
    settings = get_settings()
    models_dict = {"architect": settings.llm_model_architect or ""}

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
    return DesignResponse(
        id=design.id,
        intake_session_id=design.intake_session_id,
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

    return DesignResponse(
        id=design.id,
        intake_session_id=design.intake_session_id,
        current_version=version.version_no,
        brief=brief_obj,
        spec=spec,
        warnings=warnings_list,
        flow_order=flow_order,
        prompt_version=version.prompt_version,
        explanation=explanation_obj,
    )
