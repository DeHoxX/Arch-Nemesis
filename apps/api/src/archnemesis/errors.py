"""Custom error classes and unified error handling."""

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base application exception."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.headers = headers


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


LLMBadOutput = LLMBadOutputError


class LLMNotConfiguredError(AppError):
    def __init__(self, message: str = "The AI service is not set up on this server.") -> None:
        super().__init__(
            code="LLM_NOT_CONFIGURED",
            message=message,
            status_code=503,
        )


class InputInvalidError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="INPUT_INVALID",
            message=message,
            status_code=422,
        )


ValidationError = InputInvalidError


class InternalLLMError(AppError):
    def __init__(self, message: str = "An error occurred with the AI service.") -> None:
        super().__init__(
            code="LLM_ERROR",
            message=message,
            status_code=500,
        )


LLMError = InternalLLMError


class NotFoundError(AppError):
    def __init__(self, message: str = "We could not find that.") -> None:
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Not authorised.") -> None:
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=401,
        )


class NotReadyError(AppError):
    def __init__(
        self, message: str = "The intake session is not ready for design generation."
    ) -> None:
        super().__init__(
            code="NOT_READY",
            message=message,
            status_code=409,
        )


class SessionClosedError(AppError):
    def __init__(
        self, message: str = "Intake session is already finalized; cannot accept additional turns."
    ) -> None:
        super().__init__(
            code="SESSION_CLOSED",
            message=message,
            status_code=409,
        )


class DesignFailedError(AppError):
    def __init__(self, issues: list[str] | None = None) -> None:
        super().__init__(
            code="DESIGN_FAILED",
            message="I could not produce a design that passes all checks. Please rephrase your need or try again.",
            status_code=422,
        )
        self.issues = issues[:5] if issues else []


class NodeNotAIError(AppError):
    def __init__(self, message: str = "This node does not use an AI model.") -> None:
        super().__init__(
            code="NODE_NOT_AI",
            message=message,
            status_code=400,
        )


class InternalError(AppError):
    def __init__(self, message: str = "Something went wrong on our side.") -> None:
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=500,
        )


class StalePatchError(AppError):
    def __init__(
        self,
        message: str = "This change was based on an earlier version. Please review the updated design.",
    ) -> None:
        super().__init__(
            code="STALE_PATCH",
            message=message,
            status_code=409,
        )


class PatchBlockedError(AppError):
    def __init__(
        self,
        message: str = "This change cannot be applied because it violates architectural rules.",
    ) -> None:
        super().__init__(
            code="PATCH_BLOCKED",
            message=message,
            status_code=409,
        )


class ConfirmationRequiredError(AppError):
    def __init__(
        self,
        message: str = "This change leaves requirements uncovered and requires confirmation to proceed.",
    ) -> None:
        super().__init__(
            code="CONFIRMATION_REQUIRED",
            message=message,
            status_code=409,
        )


class CapTurnsError(AppError):
    def __init__(self, max_turns: int) -> None:
        super().__init__(
            code="CAP_TURNS",
            message=f"This design has reached the limit of {max_turns} change requests. Please contact our team to continue.",
            status_code=409,
        )


class CapVersionsError(AppError):
    def __init__(self, max_versions: int) -> None:
        super().__init__(
            code="CAP_VERSIONS",
            message=f"This design has reached the limit of {max_versions} versions. Please contact our team to continue.",
            status_code=409,
        )


class RestoreCurrentVersionError(AppError):
    def __init__(self, message: str = "Cannot restore the current version.") -> None:
        super().__init__(
            code="RESTORE_CURRENT_VERSION",
            message=message,
            status_code=409,
        )


class RateLimitedError(AppError):
    def __init__(self, retry_after: int = 60) -> None:
        super().__init__(
            code="RATE_LIMITED",
            message="Too many requests. Please try again later.",
            status_code=429,
        )
        self.retry_after = retry_after
        self.headers = {"Retry-After": str(retry_after)}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Return uniform error envelope: {"error": {"code": "...", "message": "..."}}."""
    data: dict[str, object] = {"code": exc.code, "message": exc.message}
    if hasattr(exc, "issues") and exc.issues:
        data["issues"] = exc.issues
    if hasattr(exc, "details") and exc.details:
        data["details"] = exc.details
    headers = getattr(exc, "headers", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": data},
        headers=headers,
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
