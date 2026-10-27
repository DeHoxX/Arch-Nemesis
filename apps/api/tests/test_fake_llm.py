"""Tests for FakeLLMClient test utility."""

import pytest
from pydantic import BaseModel

from archnemesis.llm.base import LLMTask, LLMUnavailable
from archnemesis.llm.fake import FakeLLMClient, FakeScriptExhausted


class DummySchema(BaseModel):
    name: str


@pytest.mark.asyncio
async def test_fake_llm_text_and_json_sequence() -> None:
    client = FakeLLMClient(
        script=[
            "hello text reply",
            {"name": "architecture design"},
        ]
    )

    t_res = await client.generate_text(task=LLMTask.INTAKE, system="sys", user="user1")
    assert t_res == "hello text reply"

    j_res = await client.generate_json(
        task=LLMTask.ARCHITECT, system="sys2", user="user2", schema=DummySchema
    )
    assert j_res == {"name": "architecture design"}

    assert len(client.calls) == 2
    assert client.calls[0] == {
        "task": LLMTask.INTAKE,
        "system": "sys",
        "user": "user1",
    }
    assert client.calls[1] == {
        "task": LLMTask.ARCHITECT,
        "system": "sys2",
        "user": "user2",
    }


@pytest.mark.asyncio
async def test_fake_llm_raises_scripted_error() -> None:
    client = FakeLLMClient(script=[LLMUnavailable("Service down")])

    with pytest.raises(LLMUnavailable, match="Service down"):
        await client.generate_text(task=LLMTask.INTAKE, system="sys", user="hi")


@pytest.mark.asyncio
async def test_fake_llm_exhaustion() -> None:
    client = FakeLLMClient(script=["single item"])
    await client.generate_text(task=LLMTask.WRITER, system="", user="")

    with pytest.raises(FakeScriptExhausted, match="exhausted"):
        await client.generate_text(task=LLMTask.WRITER, system="", user="")
