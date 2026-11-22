"""Tests for LLM streaming and retry behavior."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import errors

from archnemesis.llm.base import (
    FunctionCallInfo,
    LLMNotConfigured,
    LLMTask,
    LLMUnavailable,
    StreamChunk,
)
from archnemesis.llm.fake import FakeLLMClient, FakeScriptExhausted
from archnemesis.llm.gemini import GeminiClient


@pytest.mark.asyncio
async def test_fake_llm_client_stream_success() -> None:
    chunks: list[StreamChunk | Exception] = [
        StreamChunk(text="Hello"),
        StreamChunk(function_call=FunctionCallInfo(name="search_models", args={"query": "llama"})),
        StreamChunk(text=" world"),
    ]
    fake = FakeLLMClient(stream_script=[chunks])

    collected: list[StreamChunk] = []
    async for chunk in fake.generate_stream(
        task=LLMTask.ADVISOR,
        system="You are an advisor.",
        contents=["User message"],
        tools=[{"name": "search_models"}],
    ):
        collected.append(chunk)

    assert len(collected) == 3
    assert collected[0].text == "Hello"
    assert collected[1].function_call is not None
    assert collected[1].function_call.name == "search_models"
    assert collected[1].function_call.args == {"query": "llama"}
    assert collected[2].text == " world"

    assert len(fake.stream_calls) == 1
    call = fake.stream_calls[0]
    assert call["task"] == LLMTask.ADVISOR
    assert call["system"] == "You are an advisor."
    assert call["contents"] == ["User message"]
    assert call["tools"] == [{"name": "search_models"}]


@pytest.mark.asyncio
async def test_fake_llm_client_stream_exhausted() -> None:
    fake = FakeLLMClient(stream_script=[])
    with pytest.raises(FakeScriptExhausted) as exc:
        async for _ in fake.generate_stream(
            task=LLMTask.ADVISOR,
            system="system",
            contents=["test"],
        ):
            pass
    assert exc.value.task == "advisor"
    assert exc.value.call_count == 1


@pytest.mark.asyncio
async def test_gemini_client_stream_unconfigured() -> None:
    client = GeminiClient(
        api_key=None,
        model_names={LLMTask.ADVISOR: "gemini-2.5-flash"},
    )
    with pytest.raises(LLMNotConfigured):
        async for _ in client.generate_stream(
            task=LLMTask.ADVISOR,
            system="system",
            contents=["test"],
        ):
            pass

    client_missing_task = GeminiClient(
        api_key="test-key",
        model_names={LLMTask.ADVISOR: None},
    )
    with pytest.raises(LLMNotConfigured):
        async for _ in client_missing_task.generate_stream(
            task=LLMTask.ADVISOR,
            system="system",
            contents=["test"],
        ):
            pass


@pytest.mark.asyncio
async def test_gemini_client_stream_retry_before_first_chunk() -> None:
    client = GeminiClient(
        api_key="test-key",
        model_names={LLMTask.ADVISOR: "gemini-2.5-flash"},
        max_attempts=3,
    )

    class MockStreamIter:
        def __init__(self, items: list[Any]) -> None:
            self.items = items
            self.idx = 0

        def __aiter__(self) -> "MockStreamIter":
            return self

        async def __anext__(self) -> Any:
            if self.idx >= len(self.items):
                raise StopAsyncIteration
            item = self.items[self.idx]
            self.idx += 1
            if isinstance(item, Exception):
                raise item
            return item

    chunk1 = MagicMock()
    chunk1.text = "Hello"
    chunk1.function_calls = None
    chunk1.candidates = []

    attempts = 0

    async def mock_generate_stream(*args: Any, **kwargs: Any) -> MockStreamIter:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            api_err = errors.APIError(503, "Unavailable", {})
            api_err.code = 503
            api_err.message = "Unavailable"
            raise api_err
        return MockStreamIter([chunk1])

    assert client._client is not None
    with (
        patch.object(
            client._client.aio.models, "generate_content_stream", side_effect=mock_generate_stream
        ),
        patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        results = []
        async for c in client.generate_stream(
            task=LLMTask.ADVISOR,
            system="sys",
            contents=["hi"],
        ):
            results.append(c)

        assert attempts == 2
        assert mock_sleep.await_count == 1
        assert len(results) == 1
        assert results[0].text == "Hello"


@pytest.mark.asyncio
async def test_gemini_client_stream_no_retry_after_first_chunk() -> None:
    client = GeminiClient(
        api_key="test-key",
        model_names={LLMTask.ADVISOR: "gemini-2.5-flash"},
        max_attempts=3,
    )

    class MockStreamIter:
        def __init__(self) -> None:
            self.count = 0

        def __aiter__(self) -> "MockStreamIter":
            return self

        async def __anext__(self) -> Any:
            self.count += 1
            if self.count == 1:
                c = MagicMock()
                c.text = "Start"
                c.function_calls = None
                c.candidates = []
                return c
            # Error during stream
            api_err = errors.APIError(503, "Mid stream fail", {})
            api_err.code = 503
            api_err.message = "Mid stream fail"
            raise api_err

    stream_iter = MockStreamIter()

    assert client._client is not None
    with (
        patch.object(
            client._client.aio.models, "generate_content_stream", return_value=stream_iter
        ),
        patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        results = []
        with pytest.raises(LLMUnavailable):
            async for c in client.generate_stream(
                task=LLMTask.ADVISOR,
                system="sys",
                contents=["hi"],
            ):
                results.append(c)

        # First chunk was yielded, error after first chunk was raised immediately
        assert len(results) == 1
        assert results[0].text == "Start"
        # Sleep was NOT called because no retry occurred after the first chunk
        assert mock_sleep.await_count == 0
