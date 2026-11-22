"""FastAPI router for generating and retrieving model suggestions (Stage 6B, D-404)."""

from fastapi import APIRouter

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.models import service
from archnemesis.modules.models.schemas import ModelSuggestionsResponse

router = APIRouter(prefix="/api/designs", tags=["models"])


@router.post("/{id}/versions/{n}/nodes/{node_id}/models", response_model=ModelSuggestionsResponse)
async def post_node_model_suggestions(
    id: str,
    n: int,
    node_id: str,
    db: DBSession,
    llm: LLM,
) -> ModelSuggestionsResponse:
    """Retrieve cached suggestions or lazily generate recommendations for an AI node."""
    return await service.get_or_generate_model_suggestions(
        db=db,
        llm=llm,
        design_id=id,
        version_no=n,
        node_id=node_id,
    )
