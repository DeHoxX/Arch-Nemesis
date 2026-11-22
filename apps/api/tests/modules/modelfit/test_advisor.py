"""Unit tests for AdvisorService, prompt audit, and tool execution."""

import json
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from archnemesis.db.tables import Base
from archnemesis.llm.base import FunctionCallInfo, StreamChunk
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.modules.modelfit.advisor.service import MAX_TOOL_ROUNDS, AdvisorService
from archnemesis.modules.modelfit.advisor.tools import execute_tool
from archnemesis.modules.modelfit.hardware.service import HardwareService


def test_advisor_prompt_has_no_forbidden_claims() -> None:
    prompt_path = Path(__file__).parents[3] / "src" / "archnemesis" / "prompts" / "advisor_v1.md"
    assert prompt_path.is_file()
    text = prompt_path.read_text(encoding="utf-8").lower()

    # Rule 4: No effort, cost, price or timeline figures
    forbidden_terms = [
        "dollar",
        "$",
        "eur",
        "pricing tier",
        "cloud bill",
        "guaranteed to run",
        "will run 100%",
        "legally compliant",
        "regulatory compliance",
    ]
    for term in forbidden_terms:
        assert term not in text, f"Found forbidden term '{term}' in advisor_v1.md"


@pytest.mark.asyncio
async def test_execute_list_hardware_tool() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    async with sm() as session:
        res = await execute_tool("list_hardware", {}, session)
        assert "profiles" in res
    await engine.dispose()


@pytest.mark.asyncio
async def test_advisor_service_process_chat() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)

    # Multi-round tool calling: Round 1 requests tool call, Round 2 provides final answer
    round_1_chunks: list[StreamChunk | Exception] = [
        StreamChunk(function_call=FunctionCallInfo(name="list_hardware", args={})),
    ]
    round_2_chunks: list[StreamChunk | Exception] = [
        StreamChunk(text="Here are the available GPUs."),
    ]
    fake_llm = FakeLLMClient(stream_script=[round_1_chunks, round_2_chunks])

    svc = AdvisorService(llm_client=fake_llm)

    async with sm() as session:
        # Seed real hardware presets into the test database
        hw_svc = HardwareService()
        presets_path = (
            Path(__file__).parents[3]
            / "src"
            / "archnemesis"
            / "modules"
            / "modelfit"
            / "hardware"
            / "seeds"
            / "hardware_presets.json"
        )
        expected_presets = json.loads(presets_path.read_text(encoding="utf-8"))
        expected_count = len(expected_presets)
        seed_count = await hw_svc.seed_default_presets(session)
        assert seed_count == expected_count

        events = []
        async for ev in svc.process_chat(
            messages=[{"role": "user", "content": "What hardware do you support?"}],
            session=session,
            client_ip="127.0.0.1",
        ):
            events.append(ev)

        # Assert exact event order: tool_call -> tool_result -> message -> done
        event_types = [e.event for e in events]
        assert event_types == ["tool_call", "tool_result", "message", "done"]

        # Assert rounds <= MAX_TOOL_ROUNDS
        assert len(fake_llm.stream_calls) == 2
        assert len(fake_llm.stream_calls) <= MAX_TOOL_ROUNDS

        # Assert tool result was passed back in round 2's contents matching real shape
        round_2_contents = fake_llm.stream_calls[1]["contents"]
        last_turn = round_2_contents[-1]
        assert last_turn.role == "user"
        assert len(last_turn.parts) == 1
        fn_resp = last_turn.parts[0].function_response
        assert fn_resp.name == "list_hardware"
        profiles = fn_resp.response["result"]["profiles"]
        assert isinstance(profiles, list)
        assert len(profiles) > 0
        assert len(profiles) == expected_count

    await engine.dispose()


@pytest.mark.asyncio
async def test_advisor_service_tool_call_loop_caps_at_max_rounds() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)

    # Provide 6 consecutive tool call streams (exceeding MAX_TOOL_ROUNDS = 5)
    tool_chunk: list[StreamChunk | Exception] = [
        StreamChunk(function_call=FunctionCallInfo(name="list_hardware", args={}))
    ]
    fake_llm = FakeLLMClient(stream_script=[list(tool_chunk) for _ in range(MAX_TOOL_ROUNDS + 2)])

    svc = AdvisorService(llm_client=fake_llm)

    async with sm() as session:
        # Seed presets so list_hardware tool calls succeed cleanly
        hw_svc = HardwareService()
        await hw_svc.seed_default_presets(session)

        events = []
        async for ev in svc.process_chat(
            messages=[{"role": "user", "content": "Keep looping tools"}],
            session=session,
            client_ip="127.0.0.1",
        ):
            events.append(ev)

        assert len(fake_llm.stream_calls) == MAX_TOOL_ROUNDS
        assert events[-1].event == "done"

    await engine.dispose()
