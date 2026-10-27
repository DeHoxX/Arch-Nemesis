"""Deterministic FakeLLMClient for zero-cost, reproducible unit testing."""

from typing import Any

from pydantic import BaseModel

from archnemesis.llm.base import LLMClient, LLMError, LLMTask


class FakeScriptExhausted(LLMError):
    """Raised when the scripted responses in FakeLLMClient are exhausted."""


class FakeLLMClient(LLMClient):
    """Fake LLM client that returns scripted responses or raises scripted errors."""

    def __init__(self, script: list[str | dict[str, Any] | Exception] | None = None) -> None:
        self.script: list[str | dict[str, Any] | Exception] = list(script) if script else []
        self.calls: list[dict[str, Any]] = []

    def _next_item(self, task: LLMTask, system: str, user: str) -> str | dict[str, Any]:
        self.calls.append({"task": task, "system": system, "user": user})
        if not self.script:
            raise FakeScriptExhausted("FakeLLMClient script has been exhausted.")
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def generate_text(self, task: LLMTask, system: str, user: str) -> str:
        """Return next scripted string."""
        item = self._next_item(task, system, user)
        if not isinstance(item, str):
            raise TypeError(f"Expected str for generate_text, got {type(item).__name__}")
        return item

    async def generate_json(
        self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
    ) -> dict[str, Any]:
        """Return next scripted dict."""
        item = self._next_item(task, system, user)
        if not isinstance(item, dict):
            raise TypeError(f"Expected dict for generate_json, got {type(item).__name__}")
        return item
