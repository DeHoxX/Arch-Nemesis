"""FastAPI router for intake discovery dialogue."""

from fastapi import APIRouter, Depends

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.intake import service
from archnemesis.modules.intake.schemas import (
    IntakeTurnRequest,
    IntakeTurnResponse,
)
from archnemesis.rate_limit import rate_limit

router = APIRouter(prefix="/api/intake", tags=["intake"])


@router.post(
    "/turn", response_model=IntakeTurnResponse, dependencies=[Depends(rate_limit("intake"))]
)
async def post_turn(
    request: IntakeTurnRequest,
    db: DBSession,
    llm: LLM,
) -> IntakeTurnResponse:
    """Execute an intake discovery dialogue turn."""
    return await service.handle_turn(db=db, request=request, llm=llm)
