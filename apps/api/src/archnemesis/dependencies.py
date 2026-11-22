"""FastAPI dependencies for database sessions and LLM clients."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.engine import async_session_factory
from archnemesis.llm.base import LLMClient, LLMTask
from archnemesis.llm.gemini import GeminiClient
from archnemesis.settings import get_settings


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an asynchronous database session."""
    async with async_session_factory() as session:
        yield session


def get_llm_client() -> LLMClient:
    """Provide configured LLM client."""
    settings = get_settings()
    api_key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None
    model_names: dict[LLMTask, str | None] = {
        LLMTask.INTAKE: settings.llm_model_intake,
        LLMTask.ARCHITECT: settings.llm_model_architect,
        LLMTask.WRITER: settings.llm_model_writer,
        LLMTask.MODELS: settings.llm_model_models,
    }
    return GeminiClient(
        api_key=api_key,
        model_names=model_names,
        timeout_seconds=settings.llm_timeout_seconds,
    )


DBSession = Annotated[AsyncSession, Depends(get_db_session)]
LLM = Annotated[LLMClient, Depends(get_llm_client)]
