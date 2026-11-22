"""Unit tests for model catalog classification, normalization, and rate limiting."""

import httpx
import pytest

from archnemesis.errors import AppError
from archnemesis.modules.modelfit.catalog.classifier import classify_model_support
from archnemesis.modules.modelfit.catalog.hf_client import HubClient
from archnemesis.modules.modelfit.catalog.normalizer import normalize_hf_config
from archnemesis.modules.modelfit.catalog.schemas import SupportStatus
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
