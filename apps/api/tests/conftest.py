"""Shared test fixtures and helpers for backend tests."""

from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import Base
from archnemesis.settings import Settings, get_settings


@pytest.fixture(autouse=True)
def isolate_settings_from_env_file(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[None, None, None]:
    """Ensure all backend tests run hermetically isolated from developer local .env file."""
    # 1. Prevent Pydantic from reading on-disk .env file
    monkeypatch.setitem(Settings.model_config, "env_file", None)

    # 2. Provide dummy test model names so services don't fail with LLM_NOT_CONFIGURED
    monkeypatch.setenv("LLM_MODEL_INTAKE", "test-model")
    monkeypatch.setenv("LLM_MODEL_ARCHITECT", "test-model")
    monkeypatch.setenv("LLM_MODEL_WRITER", "test-model")

    # 3. Ensure secrets and credentials remain unset by default
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    # 4. Clear cached settings before and after each test
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def error_body(response: httpx.Response) -> dict[str, Any]:
    """Extract and return the error envelope payload {"code": ..., "message": ...}."""
    json_data = response.json()
    assert "error" in json_data, f"Response does not have 'error' envelope: {json_data}"
    error_dict = json_data["error"]
    assert isinstance(error_dict, dict), f"Expected dict for error, got {type(error_dict)}"
    return error_dict


@pytest.fixture
async def temp_db_session_factory(
    tmp_path: Path,
) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """Provide an isolated SQLite database using a temporary file for each test."""
    db_file = tmp_path / "test_temp.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    engine, session_factory = create_engine_and_session(db_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield session_factory

    await engine.dispose()
    if db_file.exists():
        try:
            db_file.unlink()
        except OSError:
            pass
