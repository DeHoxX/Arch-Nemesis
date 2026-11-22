"""Tests for ModelFitClient (Stage 6A, D-401)."""

from typing import Any

import httpx
import pytest

from archnemesis.modules.models.client import ModelFitClient, ModelFitUnavailable
from archnemesis.modules.models.schemas import ProbeResult


def create_fake_transport(
    handler: httpx._types.AsyncByteStream | None = None,
    status_code: int = 200,
    json_data: dict[str, Any] | None = None,
) -> httpx.MockTransport:
    def fake_handler(request: httpx.Request) -> httpx.Response:
        if status_code == 429:
            return httpx.Response(
                429, headers={"Retry-After": "60"}, json={"error": "Rate limit exceeded"}
            )
        if status_code == 500:
            return httpx.Response(500, json={"error": "Internal server error"})
        if status_code == 403:
            return httpx.Response(403, json={"error": {"code": "GATED_REPO", "message": "Gated"}})
        return httpx.Response(status_code, json=json_data or {})

    return httpx.MockTransport(fake_handler)


@pytest.mark.asyncio
async def test_list_models_empty_base_url_raises_immediately() -> None:
    client = ModelFitClient(base_url="")
    with pytest.raises(ModelFitUnavailable, match="base URL is not configured"):
        await client.list_models("text-generation")


@pytest.mark.asyncio
async def test_list_models_parses_items_successfully() -> None:
    payload = {
        "items": [
            {
                "id": "meta-llama/Llama-3.2-3B",
                "author": "meta-llama",
                "model_name": "Llama-3.2-3B",
                "total_params": 3210000000,
                "downloads": 100000,
                "likes": 500,
                "gated": False,
            }
        ]
    }
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    items = await client.list_models("text-generation")
    assert len(items) == 1
    assert items[0]["id"] == "meta-llama/Llama-3.2-3B"


@pytest.mark.asyncio
async def test_list_models_429_raises_unavailable() -> None:
    transport = httpx.MockTransport(lambda req: httpx.Response(429, json={"error": "rate limit"}))
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    with pytest.raises(ModelFitUnavailable, match="rate limit"):
        await client.list_models("text-generation")


@pytest.mark.asyncio
async def test_list_models_500_raises_unavailable() -> None:
    transport = httpx.MockTransport(lambda req: httpx.Response(500, text="Server Error"))
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    with pytest.raises(ModelFitUnavailable, match="server error"):
        await client.list_models("text-generation")


@pytest.mark.asyncio
async def test_list_models_timeout_raises_unavailable() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Timeout connecting to ModelFit")

    transport = httpx.MockTransport(handler)
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    with pytest.raises(ModelFitUnavailable, match="timed out"):
        await client.list_models("text-generation")


@pytest.mark.asyncio
async def test_list_models_ttl_cache_hit_and_expiry() -> None:
    call_count = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            200,
            json={
                "items": [
                    {"id": f"model-{call_count}", "author": "a", "model_name": "m", "gated": False}
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    simulated_time = 1000.0

    client = ModelFitClient(
        base_url="http://127.0.0.1:8100",
        cache_ttl=300.0,
        clock=lambda: simulated_time,
        transport=transport,
    )

    # 1. First call -> network call
    res1 = await client.list_models("text-generation")
    assert call_count == 1
    assert res1[0]["id"] == "model-1"

    # 2. Advance clock by 299s -> cache hit, no network call
    simulated_time += 299.0
    res2 = await client.list_models("text-generation")
    assert call_count == 1
    assert res2[0]["id"] == "model-1"

    # 3. Advance clock past 300s -> cache expired, second network call
    simulated_time += 2.0
    res3 = await client.list_models("text-generation")
    assert call_count == 2
    assert res3[0]["id"] == "model-2"


@pytest.mark.asyncio
async def test_probe_model_open_success() -> None:
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json={
                "gated": False,
                "normalized_model": {
                    "total_params": 751632384,
                },
            },
        )
    )
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    result = await client.probe_model_open("author/model")
    assert result.status == ProbeResult.OPEN
    assert result.total_params == 751632384


@pytest.mark.asyncio
async def test_probe_model_open_gated_flag_true() -> None:
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json={
                "gated": True,
                "normalized_model": {
                    "total_params": 751632384,
                },
            },
        )
    )
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    result = await client.probe_model_open("author/model")
    assert result.status == ProbeResult.GATED
    assert result.total_params is None


@pytest.mark.asyncio
async def test_probe_model_open_403_returns_gated() -> None:
    transport = httpx.MockTransport(
        lambda req: httpx.Response(403, json={"error": {"code": "GATED_REPO"}})
    )
    client = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport)
    result = await client.probe_model_open("author/model")
    assert result.status == ProbeResult.GATED
    assert result.total_params is None


@pytest.mark.asyncio
async def test_probe_model_open_500_or_timeout_returns_unknown_never_open() -> None:
    transport_500 = httpx.MockTransport(
        lambda req: httpx.Response(500, json={"error": "server error"})
    )
    client_500 = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport_500)
    res_500 = await client_500.probe_model_open("author/model")
    assert res_500.status == ProbeResult.UNKNOWN
    assert res_500.total_params is None

    def timeout_handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Timeout")

    client_timeout = ModelFitClient(
        base_url="http://127.0.0.1:8100", transport=httpx.MockTransport(timeout_handler)
    )
    res_timeout = await client_timeout.probe_model_open("author/model")
    assert res_timeout.status == ProbeResult.UNKNOWN
    assert res_timeout.total_params is None


@pytest.mark.asyncio
async def test_probe_empty_base_url_returns_unknown() -> None:
    client = ModelFitClient(base_url="")
    res_empty = await client.probe_model_open("author/model")
    assert res_empty.status == ProbeResult.UNKNOWN
    assert res_empty.total_params is None


@pytest.mark.asyncio
async def test_probe_non_int_or_missing_params_yields_none() -> None:
    # 1. Missing normalized_model entirely
    transport_no_norm = httpx.MockTransport(lambda req: httpx.Response(200, json={"gated": False}))
    c1 = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport_no_norm)
    r1 = await c1.probe_model_open("author/model")
    assert r1.status == ProbeResult.OPEN
    assert r1.total_params is None

    # 2. String/null total_params (e.g. "14B" or null)
    transport_str = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json={
                "gated": False,
                "normalized_model": {
                    "total_params": "14B",
                },
            },
        )
    )
    c2 = ModelFitClient(base_url="http://127.0.0.1:8100", transport=transport_str)
    r2 = await c2.probe_model_open("author/model")
    assert r2.status == ProbeResult.OPEN
    assert r2.total_params is None
