"""Schema probe script to verify ArchitectureSpec and IntakeLLMOutput compatibility with Gemini.

Step 0 verification for Phase 3:
Runs both probes in sequence:
1. ArchitectureSpec (generation schema)
2. IntakeLLMOutput (intake dialogue schema)

Prints strictly:
spec: OK (or spec: <ErrorClass>: <message truncated to 200 chars>)
intake: OK (or intake: <ErrorClass>: <message truncated to 200 chars>)

Catches all exceptions per probe, including raw google.genai errors.
Never prints API keys, model names, prompts, replies, or counts.
"""

import asyncio
import sys
from pathlib import Path

# Add apps/api/src to sys.path so archnemesis package is importable
api_src = Path(__file__).resolve().parent.parent / "apps" / "api" / "src"
if str(api_src) not in sys.path:
    sys.path.insert(0, str(api_src))

from archnemesis.llm.base import LLMClient, LLMTask
from archnemesis.llm.gemini import GeminiClient
from archnemesis.modules.intake.schemas import IntakeLLMOutput
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.settings import get_settings


async def main() -> int:
    settings = get_settings()

    if not settings.gemini_api_key:
        print("spec: ValueError: GEMINI_API_KEY is not configured")
        print("intake: ValueError: GEMINI_API_KEY is not configured")
        return 1

    api_key = settings.gemini_api_key.get_secret_value()
    if not api_key:
        print("spec: ValueError: GEMINI_API_KEY is empty")
        print("intake: ValueError: GEMINI_API_KEY is empty")
        return 1

    model_architect = settings.llm_model_architect
    model_intake = settings.llm_model_intake or model_architect

    if not model_architect:
        print("spec: ValueError: LLM_MODEL_ARCHITECT is not configured")
        print("intake: ValueError: LLM_MODEL_ARCHITECT is not configured")
        return 1

    model_map = {
        LLMTask.INTAKE: model_intake,
        LLMTask.ARCHITECT: model_architect,
        LLMTask.WRITER: settings.llm_model_writer or model_architect,
    }

    client: LLMClient = GeminiClient(
        api_key=api_key,
        model_names=model_map,
        timeout_seconds=settings.llm_timeout_seconds,
    )

    exit_code = 0

    # Probe 1: ArchitectureSpec
    try:
        await client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect. Output a valid ArchitectureSpec.",
            user="Design a minimal 3-node web service: an entry client, an api router, and an exit storage.",
            schema=ArchitectureSpec,
        )
        print("spec: OK")
    except BaseException as exc:  # noqa: BLE001
        msg = str(exc)[:200]
        print(f"spec: {exc.__class__.__name__}: {msg}")
        exit_code = 1

    # Probe 2: IntakeLLMOutput
    try:
        await client.generate_json(
            task=LLMTask.INTAKE,
            system="You are an intake analyst. Output an IntakeLLMOutput JSON object.",
            user="The user needs a customer support chatbot that answers questions from documents.",
            schema=IntakeLLMOutput,
        )
        print("intake: OK")
    except BaseException as exc:  # noqa: BLE001
        msg = str(exc)[:200]
        print(f"intake: {exc.__class__.__name__}: {msg}")
        exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
