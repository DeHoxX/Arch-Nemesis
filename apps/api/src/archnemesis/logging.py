"""Structured logging with automatic sensitive data redaction."""

import logging
from typing import Any

import structlog
from structlog.types import EventDict, WrappedLogger

REDACTED_KEYS = frozenset(
    {
        "email",
        "name",
        "note",
        "api_key",
        "authorization",
        "token",
        "password",
        "prompt",
        "message",
        "text",
        "system",
        "user",
    }
)
NORMALIZED_REDACTED_KEYS = frozenset(k.replace("_", "").lower() for k in REDACTED_KEYS)


def redact_sensitive_data(val: Any) -> Any:
    """Recursively redact values where key names match REDACTED_KEYS."""
    if isinstance(val, dict):
        new_dict: dict[str, Any] = {}
        for k, v in val.items():
            if str(k).replace("_", "").lower() in NORMALIZED_REDACTED_KEYS:
                new_dict[k] = "[redacted]"
            else:
                new_dict[k] = redact_sensitive_data(v)
        return new_dict
    elif isinstance(val, list):
        return [redact_sensitive_data(item) for item in val]
    elif isinstance(val, tuple):
        return tuple(redact_sensitive_data(item) for item in val)
    return val


def redaction_processor(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """Structlog processor that replaces sensitive keys with [redacted]."""
    for key in list(event_dict.keys()):
        if str(key).replace("_", "").lower() in NORMALIZED_REDACTED_KEYS:
            event_dict[key] = "[redacted]"
        else:
            event_dict[key] = redact_sensitive_data(event_dict[key])
    return event_dict


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structlog once for the application."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Standard library logging configuration
    logging.basicConfig(format="%(message)s", level=level)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        redaction_processor,
    ]

    if log_level.upper() == "DEBUG":
        processors.append(structlog.processors.format_exc_info)

    processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
