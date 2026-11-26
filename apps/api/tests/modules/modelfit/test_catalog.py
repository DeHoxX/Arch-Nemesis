"""Unit tests for model catalog classification, normalization, and rate limiting."""

from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.errors import AppError
from archnemesis.modules.modelfit.catalog.classifier import classify_model_support
from archnemesis.modules.modelfit.catalog.hf_client import HubClient
from archnemesis.modules.modelfit.catalog.normalizer import normalize_hf_config
from archnemesis.modules.modelfit.catalog.schemas import SupportStatus
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.estimator.schemas import ArchitectureCategory


def test_classify_supported_causal_decoder() -> None:
    raw_config = {
        "architectures": ["LlamaForCausalLM"],
        "num_hidden_layers": 32,
        "hidden_size": 4096,
        "num_attention_heads": 32,
    }
    status, reason_code, message = classify_model_support(
        pipeline_tag="text-generation",
        raw_config=raw_config,
    )
    assert status == SupportStatus.SUPPORTED_LLM
    assert reason_code is None
    assert message is None


def test_classify_unsupported_encoder_only() -> None:
    raw_config = {
        "architectures": ["BertModel"],
        "num_hidden_layers": 12,
        "hidden_size": 768,
        "num_attention_heads": 12,
    }
    status, reason_code, _ = classify_model_support(
        pipeline_tag="fill-mask",
        raw_config=raw_config,
    )
    assert status == SupportStatus.UNSUPPORTED_MODALITY
    assert reason_code == "UNSUPPORTED_ENCODER_ONLY"


def test_classify_unsupported_modality() -> None:
    raw_config = {"architectures": ["StableDiffusionPipeline"]}
    status, reason_code, _ = classify_model_support(
        pipeline_tag="text-to-image",
        raw_config=raw_config,
    )
    assert status == SupportStatus.UNSUPPORTED_MODALITY
    assert reason_code == "UNSUPPORTED_MODALITY"


def test_normalize_hf_config_with_safetensors() -> None:
    raw_config = {
        "architectures": ["MistralForCausalLM"],
        "num_hidden_layers": 32,
        "hidden_size": 4096,
        "num_attention_heads": 32,
        "num_key_value_heads": 8,
    }
    model, prov = normalize_hf_config(
        repo_id="mistralai/Mistral-7B-v0.1",
        raw_config=raw_config,
        safetensors_params=7_240_000_000,
    )
    assert model.total_params == 7_240_000_000
    assert prov == "safetensors"
    assert model.architecture_category == ArchitectureCategory.STANDARD_TRANSFORMER
    assert model.num_kv_heads == 8


def test_rate_limiter_models_bucket() -> None:
    from fastapi import Request

    from archnemesis.rate_limit import SlidingWindowRateLimiter

    limiter = SlidingWindowRateLimiter()
    req = Request(scope={"type": "http", "client": ("192.168.1.50", 12345), "headers": []})
    # Bucket models allows requests within configured limits
    limiter.check(req, "models")


@pytest.mark.asyncio
async def test_hub_client_converts_httpx_timeout_and_network_error_to_app_error() -> None:
    def _timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("Connection timed out")

    async with httpx.AsyncClient(transport=httpx.MockTransport(_timeout_handler)) as client:
        hub = HubClient(client=client)
        with pytest.raises(AppError) as exc_info:
            await hub.list_models()
        assert exc_info.value.code == "UPSTREAM_UNAVAILABLE"
        assert exc_info.value.status_code == 503

    def _network_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.NetworkError("Network failure")

    async with httpx.AsyncClient(transport=httpx.MockTransport(_network_handler)) as client:
        hub = HubClient(client=client)
        with pytest.raises(AppError) as exc_info:
            await hub.list_models()
        assert exc_info.value.code == "UPSTREAM_UNAVAILABLE"
        assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_get_model_detail_single_file_404_with_safetensors_total_in_info(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/api/models/org/test-sharded"):
            return httpx.Response(
                200,
                json={
                    "pipeline_tag": "text-generation",
                    "downloads": 500,
                    "likes": 50,
                    "gated": False,
                    "safetensors": {"total": 14_000_000_000},
                },
            )
        elif url.endswith("/org/test-sharded/raw/main/config.json"):
            return httpx.Response(
                200,
                json={
                    "architectures": ["Qwen2ForCausalLM"],
                    "num_hidden_layers": 28,
                    "hidden_size": 3584,
                    "num_attention_heads": 28,
                },
            )
        elif url.endswith("/org/test-sharded/resolve/main/model.safetensors"):
            return httpx.Response(404, json={"error": "Entry not found"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        hub = HubClient(client=client)
        svc = CatalogService(hub_client=hub)
        async with temp_db_session_factory() as session:
            detail = await svc.get_model_detail(session, "org/test-sharded")
            assert detail.param_provenance == "safetensors"
            assert detail.normalized_model.total_params == 14_000_000_000
            assert detail.is_supported is True
            assert detail.downloads == 500


@pytest.mark.asyncio
async def test_get_model_detail_single_file_404_no_total_falls_back_to_derived(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/api/models/org/test-dim"):
            return httpx.Response(
                200,
                json={
                    "pipeline_tag": "text-generation",
                    "downloads": 100,
                    "likes": 10,
                    "gated": False,
                },
            )
        elif url.endswith("/org/test-dim/raw/main/config.json"):
            return httpx.Response(
                200,
                json={
                    "architectures": ["LlamaForCausalLM"],
                    "num_hidden_layers": 32,
                    "hidden_size": 4096,
                    "num_attention_heads": 32,
                },
            )
        elif url.endswith("/org/test-dim/resolve/main/model.safetensors"):
            return httpx.Response(404, json={"error": "Entry not found"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        hub = HubClient(client=client)
        svc = CatalogService(hub_client=hub)
        async with temp_db_session_factory() as session:
            detail = await svc.get_model_detail(session, "org/test-dim")
            assert detail.param_provenance == "derived"
            assert detail.normalized_model.total_params is not None
            assert detail.normalized_model.total_params > 0


@pytest.mark.asyncio
async def test_inspect_safetensors_header_429_and_5xx_propagate() -> None:
    def handler_429(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "30"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_429)) as client:
        hub = HubClient(client=client)
        with pytest.raises(AppError) as exc_429:
            await hub.inspect_safetensors_header("org/model-429")
        assert exc_429.value.code == "HF_RATE_LIMITED"
        assert exc_429.value.status_code == 429

    def handler_502(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, json={"error": "Bad Gateway"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_502)) as client:
        hub = HubClient(client=client)
        with pytest.raises(AppError) as exc_502:
            await hub.inspect_safetensors_header("org/model-502")
        assert exc_502.value.code == "UPSTREAM_UNAVAILABLE"
        assert exc_502.value.status_code == 502


@pytest.mark.asyncio
async def test_get_model_detail_sharded_fixture_with_index(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/api/models/org/sharded-model"):
            return httpx.Response(
                200,
                json={
                    "pipeline_tag": "text-generation",
                    "downloads": 1000,
                    "likes": 80,
                    "gated": False,
                    "safetensors": {"total": 32_000_000_000},
                },
            )
        elif url.endswith("/org/sharded-model/raw/main/config.json"):
            return httpx.Response(
                200,
                json={
                    "architectures": ["Qwen2ForCausalLM"],
                    "num_hidden_layers": 32,
                    "hidden_size": 4096,
                    "num_attention_heads": 32,
                },
            )
        elif url.endswith("/org/sharded-model/resolve/main/model.safetensors.index.json"):
            return httpx.Response(200, json={"metadata": {"total_size": 64_000_000_000}})
        elif url.endswith("/org/sharded-model/resolve/main/model.safetensors"):
            return httpx.Response(404, json={"error": "Entry not found"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        hub = HubClient(client=client)
        svc = CatalogService(hub_client=hub)
        async with temp_db_session_factory() as session:
            detail = await svc.get_model_detail(session, "org/sharded-model")
            assert detail.param_provenance == "safetensors"
            assert detail.normalized_model.total_params == 32_000_000_000


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_total", ["14000000000", 0, -100, True, False])
async def test_get_model_detail_safetensors_total_invalid_types_ignored(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    invalid_total: Any,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/api/models/org/invalid-total"):
            return httpx.Response(
                200,
                json={
                    "pipeline_tag": "text-generation",
                    "downloads": 50,
                    "likes": 5,
                    "gated": False,
                    "safetensors": {"total": invalid_total},
                },
            )
        elif url.endswith("/org/invalid-total/raw/main/config.json"):
            return httpx.Response(
                200,
                json={
                    "architectures": ["LlamaForCausalLM"],
                    "num_hidden_layers": 16,
                    "hidden_size": 2048,
                    "num_attention_heads": 16,
                },
            )
        elif url.endswith("/org/invalid-total/resolve/main/model.safetensors"):
            return httpx.Response(404, json={"error": "Entry not found"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        hub = HubClient(client=client)
        svc = CatalogService(hub_client=hub)
        async with temp_db_session_factory() as session:
            detail = await svc.get_model_detail(session, "org/invalid-total")
            assert detail.param_provenance == "derived"
            assert detail.normalized_model.total_params is not None
            assert detail.normalized_model.total_params > 0
