"""Shared test fixtures and helpers for backend tests."""

from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import Base


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
