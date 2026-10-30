"""FastAPI router for generating and retrieving design explanations."""

from fastapi import APIRouter

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.explainer import service
from archnemesis.modules.explainer.schemas import Explanation

router = APIRouter(prefix="/api/designs", tags=["explainer"])


@router.post("/{id}/versions/{n}/explanation", response_model=Explanation)
async def post_version_explanation(
    id: str,
    n: int,
    db: DBSession,
    llm: LLM,
) -> Explanation:
    """Generate or retrieve the explanation for a specific architecture design version."""
    return await service.get_or_generate_explanation(
        db=db,
        design_id=id,
        version_no=n,
        llm=llm,
    )
