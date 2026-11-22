"""HTTP routes for conversational AI advisor with SSE streaming."""

import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from archnemesis.dependencies import LLM, DBSession
from archnemesis.errors import AppError
from archnemesis.modules.modelfit.advisor.service import AdvisorService
from archnemesis.rate_limit import rate_limit

router = APIRouter(tags=["Advisor"])


class ChatMessagePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"] = Field(description="Message role.")
    content: str = Field(description="Message text content.")


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessagePayload] = Field(
        min_length=1,
        max_length=50,
        description="Bounded conversation history.",
    )


@router.post(
    "/chat",
    summary="Send a message to the AI advisor and stream Server-Sent Events",
    response_class=StreamingResponse,
    dependencies=[Depends(rate_limit("advisor"))],
)
async def chat_completions(
    req: ChatRequest,
    request: Request,
    session: DBSession,
    llm: LLM,
) -> StreamingResponse:
    """Streams token deltas, tool call status, and recommendation cards as Server-Sent Events."""
    client_ip = request.client.host if request.client else "unknown"
    service = AdvisorService(llm_client=llm)

    async def sse_generator() -> AsyncIterator[str]:
        messages_dicts = [m.model_dump() for m in req.messages]
        try:
            async for event in service.process_chat(
                messages=messages_dicts,
                session=session,
                client_ip=client_ip,
            ):
                data_str = json.dumps(event.data)
                yield f"event: {event.event}\ndata: {data_str}\n\n"
        except (AppError, RuntimeError, ValueError) as exc:
            err_payload = json.dumps(
                {
                    "error": {
                        "code": getattr(exc, "code", "INTERNAL_STREAM_ERROR"),
                        "message": str(exc),
                    }
                }
            )
            yield f"event: error\ndata: {err_payload}\n\n"
            yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
