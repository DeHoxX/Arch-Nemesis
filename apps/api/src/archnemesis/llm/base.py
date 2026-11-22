"""Base definitions, protocol, and exceptions for LLM clients."""

from enum import StrEnum
from typing import Any, Protocol

from pydantic import BaseModel


class LLMTask(StrEnum):
    """Tasks executed by language models."""

    INTAKE = "intake"
    ARCHITECT = "architect"
    WRITER = "writer"
    MODELS = "models"


class LLMError(Exception):
    """Base exception for all LLM client errors."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class LLMUnavailable(LLMError):
    """Raised when the AI service is unavailable (HTTP 503)."""


class LLMRateLimited(LLMError):
    """Raised when the AI service rate limit is exceeded (HTTP 429)."""


class LLMTimeout(LLMError):
    """Raised when the AI service request times out (HTTP 504 / timeout)."""


class LLMBadOutput(LLMError):
    """Raised when the AI service returns malformed or non-JSON output."""


class LLMNotConfigured(LLMError):
    """Raised when required API key or task model is missing."""


class LLMClient(Protocol):
    """Provider-neutral protocol for LLM interactions."""

    async def generate_text(self, task: LLMTask, system: str, user: str) -> str:
        """Generate unstructured text from system instruction and user prompt."""
        ...

    async def generate_json(
        self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
    ) -> dict[str, Any]:
        """Generate structured JSON adhering to the given Pydantic schema."""
        ...
