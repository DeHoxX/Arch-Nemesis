"""Tests for GeminiClient error mapping, timeout conversion, and configuration handling."""

import httpx
import pytest
import respx
from pydantic import BaseModel

from archnemesis.llm.base import (
    LLMBadOutput,
    LLMError,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
)
from archnemesis.llm.gemini import GeminiClient

FAKE_API_KEY = "test-fake-gemini-key"
FAKE_MODEL_NAME = "fake-gemini-test-model"


class SampleSchema(BaseModel):
    summary: str


def test_timeout_seconds_converts_to_milliseconds() -> None:
    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.INTAKE: FAKE_MODEL_NAME},
        timeout_seconds=45,
    )
    assert client.timeout_seconds == 45
    assert client.timeout_ms == 45000


def test_missing_api_key_raises_not_configured() -> None:
    client = GeminiClient(
        api_key=None,
        model_names={LLMTask.INTAKE: FAKE_MODEL_NAME},
    )
    with pytest.raises(LLMNotConfigured, match="API key is not configured"):
        client._get_model(LLMTask.INTAKE)


def test_missing_task_model_raises_not_configured() -> None:
    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.INTAKE: None},
    )
    with pytest.raises(LLMNotConfigured, match="Model for task 'intake' is not configured"):
        client._get_model(LLMTask.INTAKE)


@pytest.mark.asyncio
@respx.mock
async def test_gemini_server_503_maps_to_llm_unavailable() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            503,
            json={
                "error": {"code": 503, "message": "Service unavailable", "status": "UNAVAILABLE"}
            },
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.INTAKE: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMUnavailable):
        await client.generate_text(task=LLMTask.INTAKE, system="sys", user="user")


@pytest.mark.asyncio
@respx.mock
async def test_gemini_server_429_maps_to_llm_rate_limited() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "Resource exhausted",
                    "status": "RESOURCE_EXHAUSTED",
                }
            },
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.ARCHITECT: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMRateLimited):
        await client.generate_text(task=LLMTask.ARCHITECT, system="sys", user="user")


@pytest.mark.asyncio
@respx.mock
async def test_gemini_server_504_maps_to_llm_timeout() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            504,
            json={
                "error": {"code": 504, "message": "Gateway Timeout", "status": "DEADLINE_EXCEEDED"}
            },
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.WRITER: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMTimeout):
        await client.generate_text(task=LLMTask.WRITER, system="sys", user="user")


@pytest.mark.asyncio
@respx.mock
async def test_gemini_client_side_timeout_maps_to_llm_timeout() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        side_effect=httpx.ReadTimeout("Client timed out waiting for response")
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.WRITER: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMTimeout, match="timed out"):
        await client.generate_text(task=LLMTask.WRITER, system="sys", user="user")


@pytest.mark.asyncio
@respx.mock
async def test_gemini_client_connect_error_maps_to_llm_unavailable() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.WRITER: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMUnavailable, match="Failed to connect to AI service"):
        await client.generate_text(task=LLMTask.WRITER, system="sys", user="user")


@pytest.mark.asyncio
@respx.mock
async def test_gemini_generate_json_non_dict_maps_to_llm_bad_output() -> None:
    # Gemini returns a valid JSON array instead of an object dict
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": '["array", "item"]'}],
                            "role": "model",
                        }
                    }
                ]
            },
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.ARCHITECT: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMBadOutput, match="not a JSON object"):
        await client.generate_json(
            task=LLMTask.ARCHITECT,
            system="sys",
            user="user",
            schema=SampleSchema,
        )


@pytest.mark.asyncio
@respx.mock
async def test_gemini_server_408_maps_to_llm_timeout() -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            408,
            json={
                "error": {"code": 408, "message": "Request Timeout", "status": "DEADLINE_EXCEEDED"}
            },
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.WRITER: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMTimeout):
        await client.generate_text(task=LLMTask.WRITER, system="sys", user="user")


@pytest.mark.asyncio
@pytest.mark.parametrize("code", [500, 502])
@respx.mock
async def test_gemini_server_500_and_502_map_to_non_retryable_llm_error(code: int) -> None:
    respx.post(url__regex=r"https://generativelanguage\.googleapis\.com/.*").mock(
        return_value=httpx.Response(
            code,
            json={"error": {"code": code, "message": f"Server error {code}", "status": "INTERNAL"}},
        )
    )

    client = GeminiClient(
        api_key=FAKE_API_KEY,
        model_names={LLMTask.INTAKE: FAKE_MODEL_NAME},
    )

    with pytest.raises(LLMError) as exc_info:
        await client.generate_text(task=LLMTask.INTAKE, system="sys", user="user")

    assert not isinstance(exc_info.value, (LLMUnavailable, LLMRateLimited, LLMTimeout))
