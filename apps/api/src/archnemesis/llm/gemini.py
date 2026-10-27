"""Google Gemini implementation of LLMClient protocol."""

import json
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from archnemesis.llm.base import (
    LLMBadOutput,
    LLMClient,
    LLMError,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
)


class GeminiClient(LLMClient):
    """Google Gemini AI client using the official google-genai SDK."""

    def __init__(
        self,
        api_key: str | None,
        model_names: dict[LLMTask, str | None],
        timeout_seconds: int = 60,
    ) -> None:
        self.api_key = api_key
        self.model_names = model_names
        self.timeout_seconds = timeout_seconds
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
