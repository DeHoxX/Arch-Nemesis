"""Deterministic FakeLLMClient for zero-cost, reproducible unit testing."""

from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel

from archnemesis.llm.base import LLMClient, LLMError, LLMTask, StreamChunk


class FakeScriptExhausted(LLMError):
    """Raised when the scripted responses in FakeLLMClient are exhausted."""

    def __init__(self, task: str, call_count: int) -> None:
        super().__init__(
            f"FakeLLMClient script exhausted for task '{task}' after {call_count} calls."
        )
        self.task = task
        self.call_count = call_count


class FakeLLMClient(LLMClient):
    """Fake LLM client that returns scripted responses or raises scripted errors."""

    def __init__(
        self,
        script: list[str | dict[str, Any] | Exception] | None = None,
        stream_script: list[list[StreamChunk | Exception] | Exception] | None = None,
    ) -> None:
        self.script: list[str | dict[str, Any] | Exception] = list(script) if script else []
        self.stream_script: list[list[StreamChunk | Exception] | Exception] = (
            list(stream_script) if stream_script else []
        )
        self.calls: list[dict[str, Any]] = []
        self.stream_calls: list[dict[str, Any]] = []

    def _next_item(self, task: LLMTask, system: str, user: str) -> str | dict[str, Any]:
        self.calls.append({"task": task, "system": system, "user": user})
        if not self.script:
            raise FakeScriptExhausted(str(task), len(self.calls))
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

    async def generate_stream(
        self,
        task: LLMTask,
        system: str,
        contents: list[Any],
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Yield scripted stream chunks, recording every call."""
        call_record = {"task": task, "system": system, "contents": contents, "tools": tools}
        self.calls.append(call_record)
        self.stream_calls.append(call_record)
        if not self.stream_script:
            raise FakeScriptExhausted(str(task), len(self.stream_calls))
        item = self.stream_script.pop(0)
        if isinstance(item, Exception):
            raise item
        if not isinstance(item, list):
            raise TypeError(
                f"Expected list of StreamChunks for generate_stream, got {type(item).__name__}"
            )
        for chunk in item:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk
