"""FastAPI router for generating and retrieving architecture designs."""

from fastapi import APIRouter, Depends

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.designs import service
from archnemesis.modules.designs.schemas import CreateDesignRequest, DesignResponse
from archnemesis.rate_limit import rate_limit

router = APIRouter(prefix="/api/designs", tags=["designs"])


@router.post("", response_model=DesignResponse, dependencies=[Depends(rate_limit("designs"))])
async def post_create_design(
    request: CreateDesignRequest,
    db: DBSession,
    llm: LLM,
) -> DesignResponse:
    """Generate and store an architecture design from a ready intake session."""
    return await service.create_design(db=db, request=request, llm=llm)


@router.get("/{id}", response_model=DesignResponse)
async def get_design_by_id(
    id: str,
    db: DBSession,
) -> DesignResponse:
    """Retrieve an architecture design and its latest specification."""
    return await service.get_design(db=db, design_id=id)
