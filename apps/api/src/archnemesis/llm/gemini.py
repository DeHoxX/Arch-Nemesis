"""Google Gemini implementation of LLMClient protocol."""

import asyncio
import json
import random
from collections.abc import AsyncIterator
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from archnemesis.llm.base import (
    FunctionCallInfo,
    LLMBadOutput,
    LLMClient,
    LLMError,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
    StreamChunk,
)
from archnemesis.llm.retry import RETRYABLE_EXCEPTIONS


class GeminiClient(LLMClient):
    """Google Gemini AI client using the official google-genai SDK."""

    def __init__(
        self,
        api_key: str | None,
        model_names: dict[LLMTask, str | None],
        timeout_seconds: int = 60,
        max_attempts: int = 3,
    ) -> None:
        self.api_key = api_key
        self.model_names = model_names
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        # Google GenAI HttpOptions timeout is in milliseconds
        self.timeout_ms = timeout_seconds * 1000

        self._client: genai.Client | None = None
        if self.api_key:
            self._client = genai.Client(
                api_key=self.api_key,
                http_options=types.HttpOptions(timeout=self.timeout_ms),
            )

    def _get_model(self, task: LLMTask) -> str:
        """Return configured model for task or raise LLMNotConfigured."""
        if not self.api_key or self._client is None:
            raise LLMNotConfigured("Gemini API key is not configured.")
        model = self.model_names.get(task)
        if not model:
            raise LLMNotConfigured(f"Model for task '{task.value}' is not configured.")
        return model

    def _map_exception(self, exc: Exception) -> Exception:
        """Map SDK errors to base LLM exceptions."""
        if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
            return LLMTimeout("The AI service timed out.")
        if isinstance(exc, httpx.ConnectError):
            return LLMUnavailable("Failed to connect to AI service.")
        if isinstance(exc, errors.APIError):
            if exc.code == 429:
                return LLMRateLimited(f"Gemini rate limit exceeded: {exc.message}")
            if exc.code == 503:
                return LLMUnavailable(f"Gemini service unavailable: {exc.message}")
            if exc.code in (408, 504):
                return LLMTimeout(f"Gemini request timed out: {exc.message}")
            if exc.code and exc.code >= 500:
                return LLMError(f"Gemini server error ({exc.code}): {exc.message}")
        return exc

    async def generate_text(self, task: LLMTask, system: str, user: str) -> str:
        """Generate unstructured text from Gemini."""
        model = self._get_model(task)
        assert self._client is not None

        config = types.GenerateContentConfig(system_instruction=system)

        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=user,
                config=config,
            )
            if not response.text:
                raise LLMBadOutput("Gemini returned empty text response.")
            return response.text
        except Exception as e:
            mapped = self._map_exception(e)
            if mapped is not e:
                raise mapped from e
            raise

    async def generate_json(
        self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
    ) -> dict[str, Any]:
        """Generate structured JSON adhering to the given schema."""
        model = self._get_model(task)
        assert self._client is not None

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
        )

        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=user,
                config=config,
            )
            if not response.text:
                raise LLMBadOutput("Gemini returned empty response for JSON.")
            try:
                parsed = json.loads(response.text)
            except json.JSONDecodeError as err:
                raise LLMBadOutput(f"Failed to parse JSON response: {err}") from err

            if not isinstance(parsed, dict):
                raise LLMBadOutput("Gemini response is not a JSON object.")
            return parsed
        except Exception as e:
            mapped = self._map_exception(e)
            if mapped is not e:
                raise mapped from e
            raise

    def _process_stream_chunk(self, chunk: Any) -> list[StreamChunk]:
        """Convert a GenAI GenerateContentResponse chunk to StreamChunk objects."""
        items: list[StreamChunk] = []

        # Function calls
        if hasattr(chunk, "function_calls") and chunk.function_calls:
            parts: list[Any] = []
            if hasattr(chunk, "candidates") and chunk.candidates:
                cand = chunk.candidates[0]
                if hasattr(cand, "content") and cand.content and hasattr(cand.content, "parts"):
                    parts = list(cand.content.parts)
            for idx, fc in enumerate(chunk.function_calls):
                args = fc.args if isinstance(fc.args, dict) else (dict(fc.args) if fc.args else {})
                raw_part = parts[idx] if idx < len(parts) else fc
                items.append(
                    StreamChunk(
                        function_call=FunctionCallInfo(name=fc.name, args=args),
                        raw_part=raw_part,
                    )
                )

        # Text chunk
        text: str | None = None
        try:
            text = chunk.text
        except (AttributeError, ValueError):
            text = None
        if text:
            items.append(StreamChunk(text=text))

        # Raw parts fallback if no items produced yet
        if not items and hasattr(chunk, "candidates") and chunk.candidates:
            cand = chunk.candidates[0]
            if hasattr(cand, "content") and cand.content and hasattr(cand.content, "parts"):
                for part in cand.content.parts:
                    items.append(StreamChunk(raw_part=part))

        return items

    async def generate_stream(
        self,
        task: LLMTask,
        system: str,
        contents: list[Any],
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Generate streaming response with optional tool calling, retrying only before first chunk."""
        model = self._get_model(task)
        assert self._client is not None

        tool_objects: list[Any] | None = (
            [types.Tool(function_declarations=tools)] if tools else None
        )
        config = types.GenerateContentConfig(
            system_instruction=system,
            tools=tool_objects,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        attempt = 1
        current_delay = 1.0
        backoff_factor = 2.0
        max_jitter = 0.20

        stream_iter = None
        first_chunk = None

        while True:
            try:
                stream = await self._client.aio.models.generate_content_stream(
                    model=model,
                    contents=contents,
                    config=config,
                )
                stream_iter = stream.__aiter__()
                try:
                    first_chunk = await stream_iter.__anext__()
                except StopAsyncIteration:
                    return
                break
            except Exception as e:
                mapped = self._map_exception(e)
                if attempt < self.max_attempts and isinstance(mapped, RETRYABLE_EXCEPTIONS):
                    jitter = random.uniform(0, max_jitter)
                    sleep_duration = current_delay * (1 + jitter)
                    await asyncio.sleep(sleep_duration)
                    current_delay *= backoff_factor
                    attempt += 1
                    continue
                if mapped is not e:
                    raise mapped from e
                raise

        # Emit first chunk items
        for item in self._process_stream_chunk(first_chunk):
            yield item

        # Stream subsequent chunks without retry
        try:
            async for chunk in stream_iter:
                for item in self._process_stream_chunk(chunk):
                    yield item
        except Exception as e:
            mapped = self._map_exception(e)
            if mapped is not e:
                raise mapped from e
            raise
