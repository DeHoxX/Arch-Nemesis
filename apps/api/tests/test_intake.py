"""Comprehensive unit and integration tests for the intake discovery module."""

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.errors import ValidationError
from archnemesis.llm.base import LLMTask
from archnemesis.llm.fake import FakeLLMClient, FakeScriptExhausted
from archnemesis.main import create_app
from archnemesis.modules.intake import repo, service
from archnemesis.modules.intake.schemas import IntakeLLMOutput, IntakeTurnRequest
from archnemesis.prompts import load_prompt
from archnemesis.settings import Settings
from tests.conftest import error_body


def _create_test_app(
    db_factory: async_sessionmaker[AsyncSession],
    llm: FakeLLMClient,
) -> Any:
    app = create_app()

    async def override_db() -> AsyncGenerator[AsyncSession, None]:
        async with db_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_db
    app.dependency_overrides[get_llm_client] = lambda: llm
    return app


@pytest.mark.asyncio
async def test_intake_empty_input_rejected(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    fake_llm = FakeLLMClient([])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/intake/turn", json={"text": "   "})

    assert res.status_code == 422, res.text
    err = error_body(res)
    assert err["code"] == "INPUT_INVALID"
    assert "cannot be empty" in err["message"]


@pytest.mark.asyncio
async def test_intake_input_exceeds_max_chars(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "archnemesis.modules.intake.service.get_settings",
        lambda: Settings(max_input_chars=10),
    )
    fake_llm = FakeLLMClient([])
    async with temp_db_session_factory() as session:
        with pytest.raises(ValidationError, match="exceeds maximum allowed length"):
            await service.handle_turn(
                db=session,
                request=IntakeTurnRequest(text="This text is longer than ten chars"),
                llm=fake_llm,
            )


@pytest.mark.asyncio
async def test_intake_unknown_session_404(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    fake_llm = FakeLLMClient([])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"session_id": "non-existent-session-id", "text": "Hello"},
        )

    assert res.status_code == 404, res.text
    err = error_body(res)
    assert err["code"] == "NOT_FOUND"
    assert "not found" in err["message"]


@pytest.mark.asyncio
async def test_intake_session_closed_409(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await repo.create_session(session, transcript=[], status="ready")

    fake_llm = FakeLLMClient([])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"session_id": db_session.id, "text": "Additional message"},
        )

    assert res.status_code == 409, res.text
    err = error_body(res)
    assert err["code"] == "SESSION_CLOSED"
    assert "already ready" in err["message"]


@pytest.mark.asyncio
async def test_intake_clarifying_questions_and_cap(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    fake_script: list[str | dict[str, Any] | Exception] = [
        {
            "action": "ask",
            "questions": [
                "What database do you currently use?",
                "How many daily active users do you expect?",
                "Do you have compliance requirements?",
                "Extra question that should be dropped",
            ],
            "brief": None,
        }
    ]
    fake_llm = FakeLLMClient(fake_script)
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"text": "We need a new analytics portal."},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "needs_info"
    assert data["round"] == 1
    # max_questions_per_round = 3, so 4th was dropped
    assert len(data["questions"]) == 3
    assert data["brief"] is None


@pytest.mark.asyncio
async def test_intake_question_too_long_triggers_retry(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    long_q = "Q" * 205
    fake_script: list[str | dict[str, Any] | Exception] = [
        # Call 1: invalid question (> 200 chars)
        {
            "action": "ask",
            "questions": [long_q],
            "brief": None,
        },
        # Call 2 (retry): valid question
        {
            "action": "ask",
            "questions": ["Valid concise question?"],
            "brief": None,
        },
    ]
    fake_llm = FakeLLMClient(fake_script)
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"text": "Initial need."},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert len(fake_llm.calls) == 2
    assert data["questions"] == ["Valid concise question?"]


@pytest.mark.asyncio
async def test_intake_ready_path(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    fake_script: list[str | dict[str, Any] | Exception] = [
        {
            "action": "ready",
            "questions": [],
            "brief": {
                "summary": "Direct order tracking pipeline.",
                "users": "Customers",
                "data_involved": ["Order details"],
                "domain_hint": "E-Commerce",
                "stated_constraints": ["Must notify customer on shipping"],
                "unverifiable_requirements": [],
                "numbers_given": [],
                "assumptions": [],
            },
        }
    ]
    fake_llm = FakeLLMClient(fake_script)
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"text": "I need an order tracking system that notifies customers."},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "ready"
    assert data["round"] == 0
    assert data["brief"] is not None
    assert data["brief"]["stated_constraints"][0]["id"] == "bc1"


@pytest.mark.asyncio
async def test_intake_round_cap_forces_brief_on_turn_4(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Test (a): 3 asks shown in turns 1-3, turn 4 LLM asks again, forced-brief returns ready."""
    fake_llm = FakeLLMClient(
        [
            # Turn 1: ask
            {"action": "ask", "questions": ["Question 1?"], "brief": None},
            # Turn 2: ask
            {"action": "ask", "questions": ["Question 2?"], "brief": None},
            # Turn 3: ask
            {"action": "ask", "questions": ["Question 3?"], "brief": None},
            # Turn 4: normal call asks again (must be suppressed!)
            {"action": "ask", "questions": ["Unwanted 4th question set?"], "brief": None},
            # Turn 4: forced-brief call synthesizes brief
            {
                "action": "ready",
                "questions": [],
                "brief": {
                    "summary": "Completed analytics architecture discovery.",
                    "users": "Data Analysts",
                    "data_involved": ["Clickstream events"],
                    "domain_hint": "Analytics",
                    "stated_constraints": [
                        "Must process real-time clickstream events",
                        "No direct access to core CRM",
                    ],
                    "unverifiable_requirements": [],
                    "numbers_given": [
                        {"label": "throughput", "value": "5000", "unit": "events/sec"}
                    ],
                    "assumptions": ["Cloud hosting"],
                },
            },
        ]
    )
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Turn 1 (shows Q1, rounds=1)
        res1 = await client.post("/api/intake/turn", json={"text": "Initial need"})
        assert res1.status_code == 200, res1.text
        data1 = res1.json()
        assert data1["status"] == "needs_info"
        assert data1["round"] == 1
        assert data1["questions"] == ["Question 1?"]
        session_id = data1["session_id"]

        # Turn 2 (shows Q2, rounds=2)
        res2 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Answer 1"}
        )
        assert res2.status_code == 200, res2.text
        data2 = res2.json()
        assert data2["status"] == "needs_info"
        assert data2["round"] == 2
        assert data2["questions"] == ["Question 2?"]

        # Turn 3 (shows Q3, rounds=3)
        res3 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Answer 2"}
        )
        assert res3.status_code == 200, res3.text
        data3 = res3.json()
        assert data3["status"] == "needs_info"
        assert data3["round"] == 3
        assert data3["questions"] == ["Question 3?"]

        # Turn 4 (stored round == 3; LLM asks again -> forced-brief triggered; NO 4th question set!)
        res4 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Answer 3"}
        )
        assert res4.status_code == 200, res4.text
        data4 = res4.json()
        assert data4["status"] == "ready"
        assert data4["round"] == 3
        assert data4["questions"] == []
        assert data4["brief"] is not None

        # Verify code-assigned constraint IDs
        constraints = data4["brief"]["stated_constraints"]
        assert len(constraints) == 2
        assert constraints[0]["id"] == "bc1"
        assert constraints[0]["text"] == "Must process real-time clickstream events"
        assert constraints[1]["id"] == "bc2"
        assert constraints[1]["text"] == "No direct access to core CRM"

        # Check that forced-brief call used intake_forced_v1.md system prompt
        assert len(fake_llm.calls) == 5
        forced_call = fake_llm.calls[-1]
        assert forced_call["system"] == load_prompt("intake_forced_v1.md")


@pytest.mark.asyncio
async def test_intake_turn_4_ready_directly_no_forced_call(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Test (b): turn 4 LLM returns ready directly, no forced call."""
    fake_llm = FakeLLMClient(
        [
            # Turn 1
            {"action": "ask", "questions": ["Question 1?"], "brief": None},
            # Turn 2
            {"action": "ask", "questions": ["Question 2?"], "brief": None},
            # Turn 3
            {"action": "ask", "questions": ["Question 3?"], "brief": None},
            # Turn 4: LLM answers ready directly!
            {
                "action": "ready",
                "questions": [],
                "brief": {
                    "summary": "Completed discovery without forcing.",
                    "users": "Admins",
                    "data_involved": ["Metrics"],
                    "domain_hint": "Monitoring",
                    "stated_constraints": ["Must store metrics for 30 days"],
                    "unverifiable_requirements": [],
                    "numbers_given": [],
                    "assumptions": [],
                },
            },
        ]
    )
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/intake/turn", json={"text": "Turn 1"})
        assert res1.status_code == 200, res1.text
        session_id = res1.json()["session_id"]

        res2 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 2"}
        )
        assert res2.status_code == 200, res2.text

        res3 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 3"}
        )
        assert res3.status_code == 200, res3.text

        res4 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 4"}
        )
        assert res4.status_code == 200, res4.text
        data4 = res4.json()
        assert data4["status"] == "ready"
        assert data4["round"] == 3
        assert data4["brief"] is not None
        assert data4["questions"] == []
        # Total calls across all 4 turns is exactly 4 (no forced call)
        assert len(fake_llm.calls) == 4


@pytest.mark.asyncio
async def test_intake_forced_brief_invalid_twice_raises_llm_bad_output(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Test (c): forced-brief output invalid twice -> LLMBadOutput (502)."""
    fake_llm = FakeLLMClient(
        [
            # Turn 1
            {"action": "ask", "questions": ["Question 1?"], "brief": None},
            # Turn 2
            {"action": "ask", "questions": ["Question 2?"], "brief": None},
            # Turn 3
            {"action": "ask", "questions": ["Question 3?"], "brief": None},
            # Turn 4: normal call asks again
            {"action": "ask", "questions": ["Question 4?"], "brief": None},
            # Turn 4: forced-brief attempt 1 returns 'ask' (invalid for forced-brief)
            {"action": "ask", "questions": ["Still asking questions?"], "brief": None},
            # Turn 4: forced-brief retry attempt 2 returns 'ask' again (invalid)
            {"action": "ask", "questions": ["Persistently asking?"], "brief": None},
        ]
    )
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/intake/turn", json={"text": "Turn 1"})
        assert res1.status_code == 200, res1.text
        session_id = res1.json()["session_id"]

        res2 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 2"}
        )
        assert res2.status_code == 200, res2.text

        res3 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 3"}
        )
        assert res3.status_code == 200, res3.text

        res4 = await client.post(
            "/api/intake/turn", json={"session_id": session_id, "text": "Turn 4"}
        )
        assert res4.status_code == 502, res4.text
        err = error_body(res4)
        assert err["code"] == "LLM_BAD_OUTPUT"
        assert "could not use" in err["message"]
        # Turn 4 made 3 calls: normal + forced attempt + forced retry
        assert len(fake_llm.calls) == 6


@pytest.mark.asyncio
async def test_fake_llm_exhaustion_gives_clear_error() -> None:
    """Test (d): FakeLLMClient exhaustion gives task name and call count only."""
    fake_llm = FakeLLMClient([{"action": "ready", "questions": [], "brief": None}])

    # First call consumes the only scripted item
    await fake_llm.generate_json(
        task=LLMTask.INTAKE, system="sys", user="user prompt text", schema=IntakeLLMOutput
    )

    # Second call exhausts the script
    with pytest.raises(FakeScriptExhausted) as exc_info:
        await fake_llm.generate_json(
            task=LLMTask.INTAKE,
            system="sys",
            user="secret user text",
            schema=IntakeLLMOutput,
        )

    exc = exc_info.value
    assert exc.task == "intake"
    assert exc.call_count == 2
    assert str(exc) == "FakeLLMClient script exhausted for task 'intake' after 2 calls."
    assert "prompt" not in str(exc)
    assert "secret" not in str(exc)
