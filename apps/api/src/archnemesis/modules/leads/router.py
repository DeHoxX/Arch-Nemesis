"""FastAPI router for prospective client leads and authenticated admin operations."""

import hmac

from fastapi import APIRouter, Depends, Header, Query

from archnemesis.dependencies import DBSession
from archnemesis.errors import NotFoundError, UnauthorizedError
from archnemesis.modules.leads import service
from archnemesis.modules.leads.schemas import (
    AdminDesignVersionResponse,
    AdminLeadItem,
    CreateLeadRequest,
    CreateLeadResponse,
)
from archnemesis.rate_limit import rate_limit
from archnemesis.settings import get_settings

router = APIRouter(tags=["leads"])


def verify_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Verify admin secret token using constant-time comparison."""
    settings = get_settings()
    if settings.admin_token is None:
        raise NotFoundError()

    expected = settings.admin_token.get_secret_value().strip()
    if not expected:
        raise NotFoundError()

    if x_admin_token is None:
        raise UnauthorizedError("Not authorised.")

    if not hmac.compare_digest(x_admin_token.strip(), expected):
        raise UnauthorizedError("Not authorised.")


@router.post(
    "/api/leads",
    status_code=201,
    response_model=CreateLeadResponse,
    dependencies=[Depends(rate_limit("leads"))],
)
async def post_create_lead(
    request: CreateLeadRequest,
    db: DBSession,
) -> CreateLeadResponse:
    """Submit a prospective client lead for follow-up."""
    return await service.submit_lead(db=db, request=request)


@router.get(
    "/api/admin/leads",
    dependencies=[Depends(verify_admin_token)],
    response_model=list[AdminLeadItem],
)
async def get_admin_leads_list(
    db: DBSession,
    limit: int = Query(default=100, ge=1, le=200),
) -> list[AdminLeadItem]:
    """List recent leads for admin inspection."""
    return await service.get_admin_leads(db=db, limit=limit)


@router.get(
    "/api/admin/designs/{id}/versions/{n}",
    dependencies=[Depends(verify_admin_token)],
    response_model=AdminDesignVersionResponse,
)
async def get_admin_design_version(
    id: str,
    n: int,
    db: DBSession,
) -> AdminDesignVersionResponse:
    """Retrieve exact architecture design version for admin inspection."""
    return await service.get_admin_design_version(db=db, design_id=id, version_no=n)
