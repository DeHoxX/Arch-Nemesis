"""HTTP router tests for model suggestions endpoint (Stage 6B, D-404)."""

import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import ModelShortlistTable, ModelSuggestionTable
from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.errors import AppError
from archnemesis.llm.base import LLMClient
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app
from archnemesis.modules.modelfit.catalog.hf_client import HubClient
from archnemesis.modules.modelfit.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
    ModelSummary,
)
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.estimator.schemas import NormalizedModel
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
async def test_post_models_unavailable_when_upstream_catalog_fails(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, fake_llm = app_with_fake
    fake_llm.script = [{"task_tag": "text-generation"}]

    async def mock_failing_list_models(*args: Any, **kwargs: Any) -> Any:
        raise AppError(code="HF_UNAVAILABLE", message="HF service down", status_code=503)

    monkeypatch.setattr(CatalogService, "list_models", mock_failing_list_models)

    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-unavail", version_no=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(
            f"/api/designs/d-router-unavail/versions/1/nodes/{AI_NODE_ID}/models"
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "unavailable"
        assert data["items"] == []
        assert "not available" in data["message"].lower()

    # Verify nothing was persisted in model_suggestions table
    async with temp_db_session_factory() as db:
        stmt = select(ModelSuggestionTable).where(
            ModelSuggestionTable.design_id == "d-router-unavail",
            ModelSuggestionTable.node_id == AI_NODE_ID,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        assert record is None


@pytest.mark.asyncio
async def test_post_models_success_stores_ok_status(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, fake_llm = app_with_fake
    fake_llm.script = [{"task_tag": "text-generation"}]

    async def mock_list_models(*args: Any, **kwargs: Any) -> ModelListResponse:
        return ModelListResponse(
            items=[
                ModelSummary(
                    id="org/model-1",
                    author="org",
                    model_name="model-1",
                    pipeline_tag="text-generation",
                    downloads=1000,
                    likes=50,
                    gated=False,
                )
            ],
            next_cursor=None,
            has_more=False,
        )

    async def mock_get_detail(*args: Any, **kwargs: Any) -> ModelDetailResponse:
        return ModelDetailResponse(
            id="org/model-1",
            author="org",
            model_name="model-1",
            pipeline_tag="text-generation",
            downloads=1000,
            likes=50,
            gated=False,
            param_provenance="config",
            normalized_model=NormalizedModel(
                id="org/model-1",
                architecture_name="llama",
                total_params=1_000_000_000,
                num_layers=12,
                hidden_size=768,
                num_attention_heads=12,
            ),
        )

    monkeypatch.setattr(CatalogService, "list_models", mock_list_models)
    monkeypatch.setattr(CatalogService, "get_model_detail", mock_get_detail)

    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-ok", version_no=1)
        db.add(
            ModelShortlistTable(
                id="shortlist-1",
                task_tag="text-generation",
                repo_id="org/model-1",
                author="org",
                model_name="model-1",
                total_params=1_000_000_000,
                size_band="small",
                downloads=1000,
                likes=50,
                rank_order=1,
                refreshed_at="2026-11-24T00:00:00Z",
                expires_at="2026-12-01T00:00:00Z",
            )
        )
        await db.commit()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(f"/api/designs/d-router-ok/versions/1/nodes/{AI_NODE_ID}/models")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["id"] == "org/model-1"
        assert item["total_params"] == 1_000_000_000
        assert item["size_band"] == "small"
        assert item["details_url"] == "/models/org/model-1"
        assert item["browse_url"] == "/models"

    # Verify record in DB exists and stores status "ok" recommendations without URL fields
    async with temp_db_session_factory() as db:
        stmt = select(ModelSuggestionTable).where(
            ModelSuggestionTable.design_id == "d-router-ok",
            ModelSuggestionTable.node_id == AI_NODE_ID,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        assert record is not None
        assert record.task_tag == "text-generation"
        stored_items = json.loads(record.suggestions_json)
        assert len(stored_items) == 1
        assert stored_items[0]["id"] == "org/model-1"
        assert "details_url" not in stored_items[0]
        assert "browse_url" not in stored_items[0]


@pytest.mark.asyncio
async def test_post_models_httpx_timeout_returns_unavailable(
    app_with_fake: tuple[Any, FakeLLMClient],
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, fake_llm = app_with_fake
    fake_llm.script = [{"task_tag": "text-generation"}]

    failing_transport = httpx.MockTransport(
        lambda req: (_ for _ in ()).throw(httpx.ConnectTimeout("Connection timed out"))
    )
    mock_hub = HubClient(client=httpx.AsyncClient(transport=failing_transport))

    original_init = CatalogService.__init__

    def mock_catalog_init(self: CatalogService, *args: Any, **kwargs: Any) -> None:
        kwargs["hub_client"] = mock_hub
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(CatalogService, "__init__", mock_catalog_init)

    async with temp_db_session_factory() as db:
        await seed_design_chain(db, design_id="d-router-timeout", version_no=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(
            f"/api/designs/d-router-timeout/versions/1/nodes/{AI_NODE_ID}/models"
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "unavailable"
        assert data["items"] == []
        assert "not available" in data["message"].lower()

    # Verify nothing was persisted in model_suggestions table
    async with temp_db_session_factory() as db:
        stmt = select(ModelSuggestionTable).where(
            ModelSuggestionTable.design_id == "d-router-timeout",
            ModelSuggestionTable.node_id == AI_NODE_ID,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        assert record is None
