"""Service layer for capturing leads and fulfilling admin inspections."""

import json
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import LeadTable
from archnemesis.errors import NotFoundError
from archnemesis.modules.leads import repo
from archnemesis.modules.leads.schemas import (
    CONSENT_TEXT_VERSION,
    AdminDesignVersionResponse,
    AdminLeadItem,
    CreateLeadRequest,
    CreateLeadResponse,
)
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger()


async def submit_lead(
    db: AsyncSession,
    request: CreateLeadRequest,
) -> CreateLeadResponse:
    """Validate and persist a prospective client lead, ignoring honeypot submissions."""
    # Honeypot: if website is non-empty, silently return 201 without persisting or logging
    if request.website is not None and request.website.strip():
        return CreateLeadResponse(status="received")

    version = await repo.get_design_version(db, request.design_id, request.version_no)
    if version is None:
        raise NotFoundError("Design version not found.")

    lead_id = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()

    lead = LeadTable(
        id=lead_id,
        design_id=request.design_id,
        version_no=request.version_no,
        name=request.name,
        email=request.email,
        note=request.note,
        consent_text_version=CONSENT_TEXT_VERSION,
        created_at=now_iso,
    )
    await repo.insert_lead(db, lead)

    # Log only the lead id; never log name, email, or note
    logger.info("lead_created", lead_id=lead_id)

    return CreateLeadResponse(status="received")


async def get_admin_leads(
    db: AsyncSession,
    limit: int = 100,
) -> list[AdminLeadItem]:
    """Retrieve recent leads for admin review, ordered newest first."""
    clamped_limit = min(max(1, limit), 200)
    records = await repo.list_leads(db, limit=clamped_limit)
    return [
        AdminLeadItem(
            id=r.id,
            created_at=r.created_at,
            name=r.name,
            email=r.email,
            note=r.note,
            design_id=r.design_id,
            version_no=r.version_no,
        )
        for r in records
    ]


async def get_admin_design_version(
    db: AsyncSession,
    design_id: str,
    version_no: int,
) -> AdminDesignVersionResponse:
    """Retrieve full design version specification and walkthrough for admin inspection."""
    version = await repo.get_design_version(db, design_id, version_no)
    if version is None:
        raise NotFoundError("Design version not found.")

    brief = RequirementBrief.model_validate(json.loads(version.brief_json))
    spec = ArchitectureSpec.model_validate(json.loads(version.spec_json))
    warnings_list: list[str] = json.loads(version.warnings_json)
    flow_order = order_nodes(spec)
    explanation_dict: dict[str, object] | None = None
    if version.explanation_json is not None:
        explanation_dict = json.loads(version.explanation_json)

    return AdminDesignVersionResponse(
        brief=brief,
        spec=spec,
        warnings=warnings_list,
        flow_order=flow_order,
        explanation=explanation_dict,
    )
