"""Custom error classes and unified error handling."""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base application exception."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


# Phase 1 Specific AppError Subclasses
class LLMUnavailableError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="LLM_UNAVAILABLE",
            message="The AI service is busy right now. Please try again in a minute.",
            status_code=503,
        )


class LLMRateLimitedError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="LLM_RATE_LIMITED",
            message="The AI service is limiting requests. Please wait a minute and try again.",
            status_code=429,
        )


class LLMTimeoutError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="LLM_TIMEOUT",
            message="The AI service took too long to answer. Please try again.",
            status_code=504,
        )


class LLMBadOutputError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="LLM_BAD_OUTPUT",
            message="The AI returned an answer we could not use. Please try again.",
            status_code=502,
        )


class LLMNotConfiguredError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="LLM_NOT_CONFIGURED",
            message="The AI service is not set up on this server.",
            status_code=503,
        )


class InputInvalidError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="INPUT_INVALID",
            message=message,
            status_code=422,
        )


class NotFoundError(AppError):
    def __init__(self, message: str = "We could not find that.") -> None:
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class InternalError(AppError):
    def __init__(self, message: str = "Something went wrong on our side.") -> None:
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=500,
        )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Return uniform error envelope: {"error": {"code": "...", "message": "..."}}."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unhandled errors gracefully, logging concise class and message."""
    import structlog

    logger = structlog.get_logger()
    err_cls = exc.__class__.__name__
    err_msg = str(exc)[:200]
    logger.error("unhandled_error", exception_class=err_cls, exception_message=err_msg)

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Something went wrong on our side.",
            }
        },
    )
