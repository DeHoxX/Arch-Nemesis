"""Asynchronous retry logic with backoff and jitter for LLM calls."""

import asyncio
import random
from collections.abc import Awaitable, Callable

from archnemesis.llm.base import LLMRateLimited, LLMTimeout, LLMUnavailable

RETRYABLE_EXCEPTIONS = (LLMUnavailable, LLMRateLimited, LLMTimeout)


async def retry_async[T](
    func: Callable[[], Awaitable[T]],
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    max_jitter: float = 0.20,
    sleep_fn: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    """Retry an async function on retryable LLM exceptions.

    Delays follow: initial_delay, initial_delay * backoff_factor, etc.,
    with up to max_jitter random percentage added.
    """
    attempt = 1
    current_delay = initial_delay

    while True:
        try:
            return await func()
        except RETRYABLE_EXCEPTIONS:
            if attempt >= max_attempts:
                raise
            jitter = random.uniform(0, max_jitter)
            sleep_duration = current_delay * (1 + jitter)
            await sleep_fn(sleep_duration)
            current_delay *= backoff_factor
            attempt += 1
