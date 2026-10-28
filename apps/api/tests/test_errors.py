"""Tests for AppError handlers and error envelope consistency."""

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient

from archnemesis.errors import (
    AppError,
    InputInvalidError,
    InternalError,
    LLMBadOutputError,
    LLMNotConfiguredError,
    LLMRateLimitedError,
    LLMTimeoutError,
    LLMUnavailableError,
    NotFoundError,
)
from archnemesis.main import create_app
from tests.conftest import error_body

mock_error_router = APIRouter(prefix="/test")


@mock_error_router.get("/error/{code}")
async def raise_error(code: str) -> None:
    if code == "503":
        raise LLMUnavailableError()
    elif code == "429":
        raise LLMRateLimitedError()
    elif code == "504":
        raise LLMTimeoutError()
    elif code == "502":
        raise LLMBadOutputError()
    elif code == "not_configured":
        raise LLMNotConfiguredError()
    elif code == "422":
        raise InputInvalidError("Field 'text' exceeds limit")
    elif code == "404":
        raise NotFoundError()
    elif code == "500":
        raise InternalError()
    elif code == "unhandled":
        raise ZeroDivisionError("division by zero")
    raise AppError(code="CUSTOM_CODE", message="Custom message", status_code=400)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,expected_status,expected_code",
    [
        ("/test/error/503", 503, "LLM_UNAVAILABLE"),
        ("/test/error/429", 429, "LLM_RATE_LIMITED"),
        ("/test/error/504", 504, "LLM_TIMEOUT"),
        ("/test/error/502", 502, "LLM_BAD_OUTPUT"),
        ("/test/error/not_configured", 503, "LLM_NOT_CONFIGURED"),
        ("/test/error/422", 422, "INPUT_INVALID"),
        ("/test/error/404", 404, "NOT_FOUND"),
        ("/test/error/500", 500, "INTERNAL_ERROR"),
        ("/test/error/unhandled", 500, "INTERNAL_ERROR"),
    ],
)
async def test_error_envelope_and_status(
    path: str, expected_status: int, expected_code: str
) -> None:
    app = create_app()
    app.include_router(mock_error_router)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path)

    assert response.status_code == expected_status
    err = error_body(response)
    assert err["code"] == expected_code
    assert "message" in err
    assert isinstance(err["message"], str)
