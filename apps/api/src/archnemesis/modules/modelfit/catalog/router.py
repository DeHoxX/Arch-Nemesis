"""HTTP router for model catalog discovery and details."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, status

from archnemesis.dependencies import DBSession
from archnemesis.modules.modelfit.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
)
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.rate_limit import rate_limit

router = APIRouter(tags=["Model Catalog"])


@router.get(
    "",
    response_model=ModelListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Hugging Face models",
    description="Lists models from Hugging Face Hub with sorting, search, and pagination.",
    dependencies=[Depends(rate_limit("models"))],
)
async def list_models(
    session: DBSession,
    search: str | None = Query(default=None, description="Search query string"),
    sort: Literal["downloads", "likes", "recent"] = Query(
        default="downloads", description="Sorting field"
    ),
    limit: int = Query(default=20, ge=1, le=50, description="Max results per page (capped at 50)"),
    cursor: str | None = Query(default=None, description="Opaque cursor for pagination"),
    pipeline_tag: str | None = Query(default=None, description="Hugging Face pipeline tag filter"),
) -> ModelListResponse:
    """Retrieves list of models matching criteria."""
    service = CatalogService()
    return await service.list_models(
        session=session,
        search=search,
        sort=sort,
        limit=limit,
        cursor=cursor,
        pipeline_tag=pipeline_tag,
    )


@router.get(
    "/{repo_id:path}",
    response_model=ModelDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get model details and normalized architecture",
    description="Retrieves normalized architecture metadata, provenance, and support status.",
    dependencies=[Depends(rate_limit("models"))],
)
async def get_model(
    repo_id: str,
    session: DBSession,
) -> ModelDetailResponse:
    """Retrieves full details and normalized architecture for a Hugging Face model."""
    service = CatalogService()
    return await service.get_model_detail(session=session, repo_id=repo_id)
