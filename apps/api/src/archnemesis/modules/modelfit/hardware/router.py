"""HTTP Router for hardware presets and memory estimation."""

from fastapi import APIRouter, status

from archnemesis.dependencies import DBSession
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.estimator.schemas import EstimationResult
from archnemesis.modules.modelfit.hardware.schemas import (
    EstimateRequest,
    HardwareProfileResponse,
)
from archnemesis.modules.modelfit.hardware.service import HardwareService

router = APIRouter(tags=["Hardware"])
estimator_router = APIRouter(tags=["Estimator"])


def get_hardware_service() -> HardwareService:
    """Dependency provider for HardwareService."""
    return HardwareService()


@router.get(
    "",
    response_model=list[HardwareProfileResponse],
    status_code=status.HTTP_200_OK,
    summary="List hardware profiles",
    description="Returns all preset hardware profiles with memory specifications.",
)
async def list_hardware(
    session: DBSession,
) -> list[HardwareProfileResponse]:
    """Retrieves all registered hardware profiles from the database."""
    service = get_hardware_service()
    profiles = await service.list_profiles(session)
    return [HardwareProfileResponse.model_validate(p) for p in profiles]


@estimator_router.post(
    "",
    response_model=EstimationResult,
    status_code=status.HTTP_200_OK,
    summary="Estimate model memory",
    description="Performs deterministic memory estimation for model, config, and hardware.",
)
async def estimate(
    request: EstimateRequest,
    session: DBSession,
) -> EstimationResult:
    """Executes deterministic memory estimation via the pure calculation engine."""
    hardware_service = HardwareService()
    catalog_service = CatalogService()
    return await hardware_service.estimate_for_request(
        session=session,
        request=request,
        catalog_service=catalog_service,
    )
