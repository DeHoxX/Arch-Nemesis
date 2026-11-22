"""HTTP router tests for model suggestions endpoint (Stage 6B, D-404)."""

from collections.abc import AsyncGenerator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.llm.base import LLMClient
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app
from archnemesis.settings import get_settings
from tests.modules.models.conftest_models import AI_NODE_ID, NON_AI_NODE_ID, seed_design_chain


@pytest.fixture
def app_with_fake(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> tuple[Any, FakeLLMClient]:
    app = create_app()
    fake_llm = FakeLLMClient()

    async def override_db() -> AsyncGenerator[AsyncSession, None]:
        async with temp_db_session_factory() as session:
            yield session

    def override_llm() -> LLMClient:
        return fake_llm

    app.dependency_overrides[get_db_session] = override_db
    app.dependency_overrides[get_llm_client] = override_llm
    return app, fake_llm


@pytest.mark.asyncio
async def test_post_models_404_cases(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app, _ = app_with_fake
    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-test", version_no=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Unknown design ID
        res = await client.post(f"/api/designs/unknown/versions/1/nodes/{AI_NODE_ID}/models")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

        # 2. Unknown version number
        res = await client.post(f"/api/designs/d-router-test/versions/99/nodes/{AI_NODE_ID}/models")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"

        # 3. Unknown node ID
        res = await client.post("/api/designs/d-router-test/versions/1/nodes/unknown_node/models")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_post_models_node_not_ai_400(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app, _ = app_with_fake
    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-test", version_no=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(
            f"/api/designs/d-router-test/versions/1/nodes/{NON_AI_NODE_ID}/models"
        )
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "NODE_NOT_AI"


@pytest.mark.asyncio
async def test_post_models_unavailable_when_unconfigured(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, _ = app_with_fake
    monkeypatch.setenv("MODELFIT_BASE_URL", "")
    get_settings.cache_clear()

    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-test", version_no=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(f"/api/designs/d-router-test/versions/1/nodes/{AI_NODE_ID}/models")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "unavailable"
        assert data["items"] == []
        assert "not available" in data["message"].lower()
