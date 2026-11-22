"""AdvisorService: conversational streaming loop, tool calling, and SSE event dispatch."""

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import AppError
from archnemesis.llm.base import LLMClient, LLMTask
from archnemesis.modules.modelfit.advisor.tools import TOOL_DECLARATIONS, execute_tool
from archnemesis.settings import get_settings

logger = structlog.get_logger(__name__)

MAX_TOOL_ROUNDS = 5
MAX_INPUT_CHARS = 4000
MAX_HISTORY_MESSAGES = 20

_settings = get_settings()


@dataclass
class ChatSSEEvent:
    event: str
    data: dict[str, Any]


class AdvisorService:
    """Orchestrates natural language chat, tool executions, and streaming SSE responses."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client
        self._prompt_path = Path(__file__).parents[3] / "prompts" / "advisor_v1.md"
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self) -> str:
        if self._prompt_path.exists():
            return self._prompt_path.read_text(encoding="utf-8")
        return (
            "You are the Arch-Nemesis ModelFit Advisor. The deterministic estimation engine is the single "
            "source of truth. Never invent numbers or alter estimates. Speed and cost are out of scope."
        )

    async def process_chat(
        self,
        messages: list[dict[str, str]],
        session: AsyncSession,
        client_ip: str | None = None,
    ) -> AsyncIterator[ChatSSEEvent]:
        """Runs the streaming chat loop with tool calling, SSE events, and safety constraints."""
        start_time = time.monotonic()

        # 1. Input validation & bounding
        bounded_messages = messages[-MAX_HISTORY_MESSAGES:]
        for m in bounded_messages:
            if len(m.get("content", "")) > MAX_INPUT_CHARS:
                m["content"] = m["content"][:MAX_INPUT_CHARS]

        # Multi-turn conversation buffer for the LLM
        contents: list[Any] = []
        for m in bounded_messages:
            role = m.get("role", "user")
            text = m.get("content", "")
            genai_role = "user" if role == "user" else "model"
            contents.append(types.Content(role=genai_role, parts=[types.Part.from_text(text=text)]))

        tool_declarations_sdk = []
        for decl in TOOL_DECLARATIONS:
            tool_declarations_sdk.append(
                types.FunctionDeclaration(
                    name=str(decl["name"]),
                    description=str(decl["description"]),
                    parameters_json_schema=decl.get("parameters"),
                )
            )

        rounds = 0

        while rounds < MAX_TOOL_ROUNDS:
            rounds += 1
            has_tool_call = False
            round_text_chunks: list[str] = []
            tool_call_parts: list[Any] = []
            function_calls_to_execute = []

            try:
                async for chunk in self.llm_client.generate_stream(
                    task=LLMTask.ADVISOR,
                    system=self.system_prompt,
                    contents=contents,
                    tools=tool_declarations_sdk,
                ):
                    if chunk.function_call:
                        has_tool_call = True
                        fc = chunk.function_call
                        function_calls_to_execute.append(fc)
                        if chunk.raw_part:
                            tool_call_parts.append(chunk.raw_part)
                        yield ChatSSEEvent(
                            event="tool_call",
                            data={"name": fc.name, "args": fc.args},
                        )

                    if chunk.text:
                        round_text_chunks.append(chunk.text)
                        yield ChatSSEEvent(
                            event="message",
                            data={"delta": chunk.text},
                        )

            except AppError as exc:
                duration = time.monotonic() - start_time
                logger.warning("advisor_chat_error", code=exc.code, duration=duration)
                yield ChatSSEEvent(
                    event="error",
                    data={"error": {"code": exc.code, "message": exc.message}},
                )
                yield ChatSSEEvent(event="done", data={})
                return
            except (RuntimeError, ValueError) as exc:
                duration = time.monotonic() - start_time
                logger.error(
                    "advisor_chat_unhandled_error", error=str(exc)[:200], duration=duration
                )
                yield ChatSSEEvent(
                    event="error",
                    data={
                        "error": {
                            "code": "INTERNAL_STREAM_ERROR",
                            "message": "An error occurred while communicating with the AI service.",
                        }
                    },
                )
                yield ChatSSEEvent(event="done", data={})
                return

            if not has_tool_call:
                # Finished generating response without tool calls
                break

            # Execute tool calls
            for fc in function_calls_to_execute:
                tool_res = await execute_tool(fc.name, fc.args, session=session)
                yield ChatSSEEvent(
                    event="tool_result",
                    data={"name": fc.name, "result": tool_res},
                )

                # Emit recommendation cards if recommendation results returned
                if fc.name == "recommend_models" and "recommendations" in tool_res:
                    for rec in tool_res["recommendations"]:
                        yield ChatSSEEvent(event="recommendation_card", data=rec)

                # Append model turn and function response turn to conversation
                if tool_call_parts:
                    contents.append(types.Content(role="model", parts=tool_call_parts))
                else:
                    contents.append(
                        types.Content(
                            role="model",
                            parts=[types.Part.from_function_call(name=fc.name, args=fc.args)],
                        )
                    )

                contents.append(
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_function_response(
                                name=fc.name,
                                response={"result": tool_res},
                            )
                        ],
                    )
                )

        duration = time.monotonic() - start_time
        logger.info("advisor_chat_completed", rounds=rounds, duration=duration, status="success")
        yield ChatSSEEvent(event="done", data={})
