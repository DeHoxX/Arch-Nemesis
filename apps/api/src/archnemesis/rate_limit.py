"""In-memory sliding window rate limiting per client IP."""

import time
from collections import defaultdict, deque
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request

from archnemesis.errors import RateLimitedError
from archnemesis.settings import Settings, get_settings


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter tracking request timestamps."""

    def __init__(self, window_seconds: float = 3600.0) -> None:
        self.window_seconds = window_seconds
        # Key: (bucket, client_ip) -> deque of monotonic timestamps
        self._buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._request_counter: int = 0
        self._purge_interval: int = 100

    def get_client_ip(self, request: Request, settings: Settings) -> str:
        """Resolve client IP safely, inspecting X-Forwarded-For only for trusted proxies."""
        direct_ip = request.client.host if request.client else "127.0.0.1"

        if direct_ip in settings.rate_limit_trusted_proxies:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                # Left-most IP is the original client
                client_ip = forwarded.split(",")[0].strip()
                if client_ip:
                    return client_ip

        return direct_ip

    def check(self, request: Request, bucket: str) -> None:
        """Check rate limit for the client IP in the given bucket, raising RateLimitedError if exceeded."""
        settings = get_settings()

        limit: int
        if bucket == "intake":
            limit = settings.rate_limit_intake_per_hour
        elif bucket == "designs":
            limit = settings.rate_limit_designs_per_hour
        elif bucket == "refinement":
            limit = settings.rate_limit_refinement_per_hour
        elif bucket == "leads":
            limit = settings.rate_limit_leads_per_hour
        else:
            raise ValueError(f"Unknown rate limit bucket: '{bucket}'")

        client_ip = self.get_client_ip(request, settings)
        key = (bucket, client_ip)
        now = time.time()
        cutoff = now - self.window_seconds

        timestamps = self._buckets[key]

        # Prune entries outside current window
        while timestamps and timestamps[0] <= cutoff:
            timestamps.popleft()

        if len(timestamps) >= limit:
            oldest = timestamps[0]
            retry_after = max(1, int(self.window_seconds - (now - oldest)) + 1)
            raise RateLimitedError(retry_after=retry_after)

        timestamps.append(now)

        self._request_counter += 1
        if self._request_counter >= self._purge_interval:
            self._request_counter = 0
            self.purge(cutoff)

    def purge(self, cutoff: float) -> None:
        """Remove empty or fully expired bucket entries to reclaim memory."""
        keys_to_remove = []
        for key, timestamps in self._buckets.items():
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if not timestamps:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            self._buckets.pop(key, None)

    def clear(self) -> None:
        """Clear all rate limit state."""
        self._buckets.clear()
        self._request_counter = 0


# Global singleton instance
limiter = SlidingWindowRateLimiter()


def clear_rate_limits() -> None:
    """Helper to reset rate limit records between tests."""
    limiter.clear()


def rate_limit(bucket: str) -> Callable[[Request], Coroutine[Any, Any, None]]:
    """FastAPI dependency factory enforcing rate limits on route handlers."""

    async def dependency(request: Request) -> None:
        limiter.check(request, bucket)

    return dependency
