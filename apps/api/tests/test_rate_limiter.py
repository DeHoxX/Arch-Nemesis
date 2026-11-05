"""Tests for sliding window rate limiting and client IP resolution."""

from collections.abc import Generator
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from archnemesis.errors import AppError, app_error_handler
from archnemesis.rate_limit import SlidingWindowRateLimiter, clear_rate_limits, limiter
from archnemesis.settings import get_settings


@pytest.fixture(autouse=True)
def clean_limiter() -> Generator[None, None, None]:
    """Ensure limiter starts clean before and after every test in this module."""
    clear_rate_limits()
    yield
    clear_rate_limits()


def create_test_rate_limited_app(bucket: str = "leads") -> FastAPI:
    """Create a minimal FastAPI app with rate limiting applied to a test route."""
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]

    @app.post("/test-limit")
    async def limited_endpoint(request: Request) -> JSONResponse:
        limiter.check(request, bucket)
        return JSONResponse({"status": "ok"})

    return app


@pytest.mark.asyncio
async def test_rate_limiter_exceeded_returns_429_with_header_and_body() -> None:
    """Sending more requests than the bucket limit returns HTTP 429 with Retry-After and message."""
    settings = get_settings()
    limit = settings.rate_limit_leads_per_hour
    assert limit == 5, f"Expected leads limit of 5, got {limit}"

    app = create_test_rate_limited_app("leads")
    request_count = 0

    transport = httpx.ASGITransport(app=app, client=("192.0.2.1", 12345))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # First 5 requests must succeed
        for i in range(limit):
            res = await client.post("/test-limit")
            assert res.status_code == 200, f"Request {i + 1} failed unexpectedly: {res.text}"
            request_count += 1

        # Non-empty guard asserting we reached the limit
        assert request_count == limit

        # 6th request must exceed limit and return 429
        res_blocked = await client.post("/test-limit")
        request_count += 1
        assert request_count > limit, "Guard: did not send > limit requests"

        assert res_blocked.status_code == 429
        assert "retry-after" in res_blocked.headers
        retry_after_val = int(res_blocked.headers["retry-after"])
        assert 1 <= retry_after_val <= 3600

        data = res_blocked.json()
        assert data == {
            "error": {
                "code": "RATE_LIMITED",
                "message": "Too many requests. Please try again later.",
            }
        }


@pytest.mark.asyncio
async def test_rate_limiter_bucket_isolation() -> None:
    """Exhausting quota in one bucket does not block other buckets for the same client IP."""
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]

    @app.post("/leads-bucket")
    async def leads_route(request: Request) -> JSONResponse:
        limiter.check(request, "leads")
        return JSONResponse({"status": "leads_ok"})

    @app.post("/intake-bucket")
    async def intake_route(request: Request) -> JSONResponse:
        limiter.check(request, "intake")
        return JSONResponse({"status": "intake_ok"})

    transport = httpx.ASGITransport(app=app, client=("192.0.2.20", 54321))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Exhaust leads bucket (limit 5)
        for _ in range(5):
            res = await client.post("/leads-bucket")
            assert res.status_code == 200

        # Leads bucket is now exhausted
        blocked_lead = await client.post("/leads-bucket")
        assert blocked_lead.status_code == 429

        # Intake bucket (limit 60) for same IP must still be open
        res_intake = await client.post("/intake-bucket")
        assert res_intake.status_code == 200
        assert res_intake.json() == {"status": "intake_ok"}


def test_client_ip_trusted_proxy_uses_leftmost_x_forwarded_for() -> None:
    """When connecting directly from trusted proxy (127.0.0.1), client IP is read from left-most X-Forwarded-For."""
    custom_limiter = SlidingWindowRateLimiter()
    settings = get_settings()

    # Direct client is 127.0.0.1 (trusted)
    request = MagicMock(spec=Request)
    request.client.host = "127.0.0.1"
    request.headers = {"x-forwarded-for": "203.0.113.195, 10.0.0.1, 127.0.0.1"}

    resolved_ip = custom_limiter.get_client_ip(request, settings)
    assert resolved_ip == "203.0.113.195"


def test_client_ip_untrusted_direct_client_ignores_spoofed_x_forwarded_for() -> None:
    """When direct client is untrusted (e.g. public IP), X-Forwarded-For is ignored to prevent spoofing."""
    custom_limiter = SlidingWindowRateLimiter()
    settings = get_settings()

    # Direct client is an untrusted public IP
    request = MagicMock(spec=Request)
    request.client.host = "198.51.100.42"
    # Client sends spoofed header attempting to impersonate another IP
    request.headers = {"x-forwarded-for": "8.8.8.8"}

    resolved_ip = custom_limiter.get_client_ip(request, settings)
    # Must use the direct connection IP, NOT the spoofed header
    assert resolved_ip == "198.51.100.42"


def test_sliding_window_purge_removes_expired_keys() -> None:
    """Limiter purge cleans up empty bucket keys when all timestamps have expired."""
    custom_limiter = SlidingWindowRateLimiter(window_seconds=60.0)

    # Insert mock expired timestamps
    old_time = 1000.0
    custom_limiter._buckets[("leads", "10.0.0.1")].append(old_time)
    custom_limiter._buckets[("leads", "10.0.0.2")].append(old_time + 50.0)

    # At now = 1070.0, cutoff is 1010.0
    # 10.0.0.1 (1000.0 <= 1010.0) is expired and must be purged
    # 10.0.0.2 (1050.0 > 1010.0) remains active
    custom_limiter.purge(cutoff=1010.0)

    assert ("leads", "10.0.0.1") not in custom_limiter._buckets
    assert ("leads", "10.0.0.2") in custom_limiter._buckets
    assert len(custom_limiter._buckets[("leads", "10.0.0.2")]) == 1
