"""Smoke test script for verifying live Google Gemini connectivity.

This script is meant to be run manually by the developer (not in CI or tests).
It validates configuration, performs a lightweight live call, and reports
a simple OK or error status without ever logging secrets, full prompts, or responses.
"""

import asyncio
import sys
from pathlib import Path

# Add apps/api/src to sys.path so archnemesis package is importable
api_src = Path(__file__).resolve().parent.parent / "apps" / "api" / "src"
if str(api_src) not in sys.path:
    sys.path.insert(0, str(api_src))

from archnemesis.llm.base import LLMClient, LLMError, LLMTask  # noqa: E402
from archnemesis.llm.gemini import GeminiClient  # noqa: E402
from archnemesis.settings import get_settings  # noqa: E402


async def main() -> int:
    settings = get_settings()
    api_key = settings.gemini_api_key.get_secret_value()

    if not api_key:
        print("ERROR: GEMINI_API_KEY is not configured in environment or apps/api/.env")
        return 1

    model_map = {
        LLMTask.INTAKE: settings.llm_model_intake,
        LLMTask.ARCHITECT: settings.llm_model_architect,
        LLMTask.WRITER: settings.llm_model_writer,
    }

    missing_models = [task.value for task, model in model_map.items() if not model]
    if missing_models:
        print(f"ERROR: Missing model configuration for tasks: {', '.join(missing_models)}")
        return 1

    print("Checking live Gemini API connectivity...")
    client: LLMClient = GeminiClient(
        api_key=api_key,
        model_names=model_map,
        timeout_seconds=settings.llm_timeout_seconds,
    )

    try:
        reply = await client.generate_text(
            task=LLMTask.INTAKE,
            system="Health check probe. Output only the word OK.",
            user="Health check probe.",
        )
        if reply and len(reply.strip()) > 0:
            print("OK: Gemini responded successfully.")
            return 0
        else:
            print("ERROR: Gemini returned an empty response.")
            return 1
    except LLMError as exc:
        print(f"ERROR: LLM operation failed: {exc.__class__.__name__} - {exc.code}")
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: Unexpected error: {exc.__class__.__name__}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

