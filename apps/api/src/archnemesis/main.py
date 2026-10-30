"""FastAPI application factory and main entrypoint."""

import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from archnemesis.errors import (
    AppError,
    InternalLLMError,
    LLMBadOutputError,
    LLMNotConfiguredError,
    LLMRateLimitedError,
    LLMTimeoutError,
    LLMUnavailableError,
    app_error_handler,
    unhandled_exception_handler,
)
from archnemesis.health import router as health_router
from archnemesis.llm.base import (
    LLMBadOutput,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTimeout,
    LLMUnavailable,
)
from archnemesis.llm.base import (
    LLMError as LLMClientError,
)
from archnemesis.logging import setup_logging
from archnemesis.modules.designs.router import router as designs_router
from archnemesis.modules.explainer.router import router as explainer_router
from archnemesis.modules.intake.router import router as intake_router
from archnemesis.settings import get_settings


async def llm_client_error_handler(request: Request, exc: LLMClientError) -> JSONResponse:
    """Map low-level LLM client exceptions to canonical AppError HTTP responses."""
    app_err: AppError
    if isinstance(exc, LLMUnavailable):
        app_err = LLMUnavailableError()
    elif isinstance(exc, LLMRateLimited):
        app_err = LLMRateLimitedError()
    elif isinstance(exc, LLMTimeout):
        app_err = LLMTimeoutError()
    elif isinstance(exc, LLMBadOutput):
        app_err = LLMBadOutputError()
    elif isinstance(exc, LLMNotConfigured):
        app_err = LLMNotConfiguredError(str(exc))
    else:
        app_err = InternalLLMError(str(exc))
    return await app_error_handler(request, app_err)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    setup_logging(settings.log_level)
    logger = structlog.get_logger()

    app = FastAPI(title="Arch-Nemesis API", docs_url=None, redoc_url=None)

    # Request ID and access logging middleware (excluding bodies)
    @app.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger.info(
            "request_start",
            method=request.method,
            path=request.url.path,
        )

        try:
            response = await call_next(request)
        except LLMClientError as exc:
            response = await llm_client_error_handler(request, exc)
        except AppError as exc:
            response = await app_error_handler(request, exc)
        except Exception as exc:  # noqa: BLE001
            response = await unhandled_exception_handler(request, exc)

        response.headers["X-Request-ID"] = request_id

        logger.info(
            "request_finish",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
        )
        return response

    # Exception handlers
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(LLMClientError, llm_client_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # Routers
    app.include_router(health_router)
    app.include_router(intake_router)
    app.include_router(designs_router)
    app.include_router(explainer_router)

    return app


app = create_app()
