"""FastAPI router for intake discovery dialogue."""

from fastapi import APIRouter

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.intake import service
from archnemesis.modules.intake.schemas import (
    IntakeTurnRequest,
    IntakeTurnResponse,
)

router = APIRouter(prefix="/api/intake", tags=["intake"])


@router.post("/turn", response_model=IntakeTurnResponse)
async def post_turn(
    request: IntakeTurnRequest,
    db: DBSession,
    llm: LLM,
) -> IntakeTurnResponse:
    """Execute an intake discovery dialogue turn."""
    return await service.handle_turn(db=db, request=request, llm=llm)
