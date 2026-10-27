"""Tests for GET /api/health endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from archnemesis.main import create_app
from archnemesis.settings import Settings


@pytest.mark.asyncio
async def test_health_endpoint_healthy() -> None:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert "llm_configured" in data
    assert "database" in data
    assert "X-Request-ID" in response.headers


@pytest.mark.asyncio
async def test_health_endpoint_llm_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    test_key = "test-gemini-key-9999"
    test_model = "test-model-name"

    def mock_settings() -> Settings:
        return Settings(
            gemini_api_key=SecretStr(test_key),
            llm_model_intake=test_model,
            llm_model_architect=test_model,
            llm_model_writer=test_model,
        )

    monkeypatch.setattr("archnemesis.health.get_settings", mock_settings)

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["llm_configured"] is True
    # Ensure key and model names are never returned
    assert test_key not in response.text
    assert test_model not in response.text


@pytest.mark.asyncio
async def test_health_endpoint_llm_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def mock_settings() -> Settings:
        return Settings(gemini_api_key=None)

    monkeypatch.setattr("archnemesis.health.get_settings", mock_settings)

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["llm_configured"] is False
