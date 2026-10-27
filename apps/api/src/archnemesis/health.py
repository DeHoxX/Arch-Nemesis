"""Health check endpoint for API, database, and LLM configuration."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from archnemesis.db.engine import async_session_factory
from archnemesis.settings import get_settings

router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    llm_configured: bool
    database: str


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Return system health status with HTTP 200 always."""
    settings = get_settings()

    # Check LLM configuration: key must be present and models configured
    has_key = bool(settings.gemini_api_key and settings.gemini_api_key.get_secret_value())
    has_models = bool(
        settings.llm_model_intake and settings.llm_model_architect and settings.llm_model_writer
    )
    llm_configured = has_key and has_models

    # Check database connectivity via SELECT 1
    db_status = "error"
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
            db_status = "ok"
    except Exception:  # noqa: BLE001
        db_status = "error"

    overall_status = "ok" if db_status == "ok" else "degraded"

    return HealthResponse(
        status=overall_status,
        llm_configured=llm_configured,
        database=db_status,
    )
