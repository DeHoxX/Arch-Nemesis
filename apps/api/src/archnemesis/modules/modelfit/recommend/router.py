"""HTTP routes for deterministic recommendations."""

from fastapi import APIRouter

from archnemesis.dependencies import DBSession
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.recommend.schemas import (
    ClarificationNeeded,
    RecommendationResponse,
    RequirementSpec,
)
from archnemesis.modules.modelfit.recommend.service import RecommendService

router = APIRouter(tags=["Recommend"])


@router.post(
    "",
    response_model=RecommendationResponse | ClarificationNeeded,
    summary="Get deterministic model recommendations based on hardware and requirements",
)
async def get_recommendations(
    spec: RequirementSpec,
    session: DBSession,
) -> RecommendationResponse | ClarificationNeeded:
    """Calculates deterministic model rankings based on memory fit and scoring."""
    catalog_service = CatalogService()
    service = RecommendService(catalog_service=catalog_service)
    return await service.recommend(spec=spec, session=session)
