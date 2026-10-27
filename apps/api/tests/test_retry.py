"""Tests for retry_async utility."""

import pytest

from archnemesis.llm.base import (
    LLMBadOutput,
    LLMError,
    LLMRateLimited,
    LLMTimeout,
    LLMUnavailable,
)
from archnemesis.llm.retry import retry_async


@pytest.mark.asyncio
async def test_retry_succeeds_first_try() -> None:
    calls = 0

    async def fn() -> str:
        nonlocal calls
        calls += 1
        return "success"

    sleeps: list[float] = []

    async def mock_sleep(d: float) -> None:
        sleeps.append(d)

    result = await retry_async(fn, sleep_fn=mock_sleep)
    assert result == "success"
    assert calls == 1
    assert len(sleeps) == 0


@pytest.mark.asyncio
async def test_retry_retries_retryable_errors() -> None:
    attempts = 0
    sleeps: list[float] = []

    async def mock_sleep(d: float) -> None:
        sleeps.append(d)

    async def fn() -> str:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise LLMUnavailable("503 busy")
        if attempts == 2:
            raise LLMRateLimited("429 limit")
        return "done"

    result = await retry_async(fn, max_attempts=3, sleep_fn=mock_sleep)
    assert result == "done"
    assert attempts == 3
    assert len(sleeps) == 2
    # Verify delay progression with jitter (around 1.0s and 2.0s)
    assert 1.0 <= sleeps[0] <= 1.25
    assert 2.0 <= sleeps[1] <= 2.50


@pytest.mark.asyncio
async def test_retry_exhaustion_raises_last_error() -> None:
    attempts = 0
    sleeps: list[float] = []

    async def mock_sleep(d: float) -> None:
        sleeps.append(d)

    async def fn() -> str:
        nonlocal attempts
        attempts += 1
        raise LLMTimeout("504 timeout")

    with pytest.raises(LLMTimeout, match="504 timeout"):
        await retry_async(fn, max_attempts=3, sleep_fn=mock_sleep)

    assert attempts == 3
    assert len(sleeps) == 2


@pytest.mark.asyncio
async def test_retry_non_retryable_fails_immediately() -> None:
    attempts = 0
    sleeps: list[float] = []

    async def mock_sleep(d: float) -> None:
        sleeps.append(d)

    async def fn() -> str:
        nonlocal attempts
        attempts += 1
        raise LLMBadOutput("malformed json")

    with pytest.raises(LLMBadOutput, match="malformed json"):
        await retry_async(fn, max_attempts=3, sleep_fn=mock_sleep)

    assert attempts == 1
    assert len(sleeps) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("code", [500, 502])
async def test_retry_500_and_502_not_retried_one_call_only(code: int) -> None:
    attempts = 0
    sleeps: list[float] = []

    async def mock_sleep(d: float) -> None:
        sleeps.append(d)

    async def fn() -> str:
        nonlocal attempts
        attempts += 1
        raise LLMError(f"Gemini server error ({code})")

    with pytest.raises(LLMError, match=f"Gemini server error \\({code}\\)"):
        await retry_async(fn, max_attempts=3, sleep_fn=mock_sleep)

    assert attempts == 1
    assert len(sleeps) == 0
