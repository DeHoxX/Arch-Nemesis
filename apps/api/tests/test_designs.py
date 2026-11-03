"""Comprehensive tests for architecture designs generation and retrieval."""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.llm.base import LLMRateLimited, LLMTimeout, LLMUnavailable
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app
from archnemesis.modules.designs import repo as designs_repo
from archnemesis.modules.intake import repo as intake_repo
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.shared.brief import BriefConstraint, RequirementBrief
from tests.conftest import error_body

VALID_SPEC_DICT = {
    "nodes": [
        {
            "id": "ingress",
            "name": "Ingress Gateway",
            "type": "api_gateway",
            "role": "Receives external requests",
            "inputs": [],
            "outputs": ["raw_request"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "worker",
            "name": "Processing Worker",
            "type": "queue_worker",
            "role": "Processes tasks",
            "inputs": ["raw_request"],
            "outputs": ["db_record"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "db_sink",
            "name": "Database Sink",
            "type": "database",
            "role": "Stores records",
            "inputs": ["db_record"],
            "outputs": [],
            "tech_options": [],
            "needs_model": False,
        },
    ],
    "edges": [
        {"from": "ingress", "to": "worker", "flows": "gRPC Task"},
        {"from": "worker", "to": "db_sink", "flows": "SQL Insert"},
    ],
    "constraints": [
        {
            "id": "c1",
            "text": "All tasks must pass through worker",
            "kind": "must_pass_through",
            "node_id": "worker",
            "covers": ["bc1"],
        }
    ],
    "entry_ids": ["ingress"],
    "exit_ids": ["db_sink"],
}

INVALID_SPEC_CYCLE = {
    "nodes": [
        {
            "id": "a",
            "name": "Node A",
            "type": "service",
            "role": "Service A",
            "inputs": [],
            "outputs": ["data_a"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "b",
            "name": "Node B",
            "type": "service",
            "role": "Service B",
            "inputs": ["data_a"],
            "outputs": ["data_b"],
            "tech_options": [],
            "needs_model": False,
        },
    ],
    "edges": [
        {"from": "a", "to": "b", "flows": "c1"},
        {"from": "b", "to": "a", "flows": "c2"},
    ],
    "constraints": [],
    "entry_ids": ["a"],
    "exit_ids": ["b"],
}

SAMPLE_BRIEF = RequirementBrief(
    summary="Order processing pipeline.",
    users="Online shoppers",
    data_involved=["Orders"],
    domain_hint="Commerce",
    stated_constraints=[BriefConstraint(id="bc1", text="Worker must process orders")],
    unverifiable_requirements=["Latency must feel instant"],
    numbers_given=[],
    assumptions=[],
)


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
async def test_create_design_from_ready_session_success(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[{"speaker": "user", "text": "Process orders"}],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

    fake_llm = FakeLLMClient([VALID_SPEC_DICT])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": db_session.id})

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["intake_session_id"] == db_session.id
    assert data["current_version"] == 1
    assert data["prompt_version"] == "architect_v8"
    assert data["brief"]["summary"] == "Order processing pipeline."
    assert data["brief"]["unverifiable_requirements"] == ["Latency must feel instant"]
    assert "warnings" in data
    assert isinstance(data["warnings"], list)
    assert len(data["spec"]["nodes"]) == 3

    # Verify flow order matches order_nodes
    spec = ArchitectureSpec.model_validate(data["spec"])
    expected_order = order_nodes(spec)
    assert data["flow_order"] == expected_order
    assert data["flow_order"] == ["ingress", "worker", "db_sink"]


@pytest.mark.asyncio
async def test_create_design_session_not_ready_409(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")

    fake_llm = FakeLLMClient([])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": db_session.id})

    assert res.status_code == 409, res.text
    err = error_body(res)
    assert err["code"] == "NOT_READY"
    assert "not ready" in err["message"]


@pytest.mark.asyncio
async def test_create_design_unknown_session_404(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    fake_llm = FakeLLMClient([])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": "missing-uuid"})

    assert res.status_code == 404, res.text
    err = error_body(res)
    assert err["code"] == "NOT_FOUND"
    assert "not found" in err["message"]


@pytest.mark.asyncio
async def test_create_design_idempotency_returns_existing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

    fake_llm = FakeLLMClient([VALID_SPEC_DICT])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First call creates the design
        res1 = await client.post("/api/designs", json={"session_id": db_session.id})
        assert res1.status_code == 200, res1.text
        design_id_1 = res1.json()["id"]

        # Second call returns existing design without calling LLM again
        res2 = await client.post("/api/designs", json={"session_id": db_session.id})
        assert res2.status_code == 200, res2.text
        design_id_2 = res2.json()["id"]

    assert design_id_1 == design_id_2
    assert len(fake_llm.calls) == 1  # Only called once
    data1 = res1.json()
    data2 = res2.json()
    assert data1["brief"]["summary"] == data2["brief"]["summary"] == "Order processing pipeline."
    assert (
        data1["brief"]["unverifiable_requirements"]
        == data2["brief"]["unverifiable_requirements"]
        == ["Latency must feel instant"]
    )
    expected_no_ai_warning = [
        "No node in the architecture is marked as using an AI model (needs_model: true)."
    ]
    assert data1["warnings"] == data2["warnings"] == expected_no_ai_warning


@pytest.mark.asyncio
async def test_create_design_always_invalid_stores_nothing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

    # 3 invalid specs in a row
    fake_llm = FakeLLMClient([INVALID_SPEC_CYCLE, INVALID_SPEC_CYCLE, INVALID_SPEC_CYCLE])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": db_session.id})

    assert res.status_code == 422, res.text
    err = error_body(res)
    assert err["code"] == "DESIGN_FAILED"
    assert "could not produce a design" in err["message"]
    assert "issues" in err
    assert len(err["issues"]) > 0

    # Verify nothing was stored in the database
    async with temp_db_session_factory() as session:
        design = await designs_repo.get_design_by_session_id(session, db_session.id)
        assert design is None


@pytest.mark.asyncio
async def test_get_design_by_id_success_and_missing_404(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

    fake_llm = FakeLLMClient([VALID_SPEC_DICT])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create
        create_res = await client.post("/api/designs", json={"session_id": db_session.id})
        assert create_res.status_code == 200, create_res.text
        design_id = create_res.json()["id"]

        # Fetch
        get_res = await client.get(f"/api/designs/{design_id}")
        assert get_res.status_code == 200, get_res.text
        data = get_res.json()
        assert data["id"] == design_id
        assert data["brief"]["summary"] == "Order processing pipeline."
        assert data["brief"]["unverifiable_requirements"] == ["Latency must feel instant"]
        assert "warnings" in data
        assert isinstance(data["warnings"], list)
        expected_no_ai_warning = [
            "No node in the architecture is marked as using an AI model (needs_model: true)."
        ]
        assert data["warnings"] == expected_no_ai_warning
        assert data["flow_order"] == ["ingress", "worker", "db_sink"]

        # Missing design
        missing_res = await client.get("/api/designs/non-existent-design-id")
        assert missing_res.status_code == 404, missing_res.text
        err = error_body(missing_res)
        assert err["code"] == "NOT_FOUND"
        assert "not found" in err["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exc_to_raise,expected_status,expected_code,expected_message",
    [
        (
            LLMUnavailable("Gemini service 503 high demand"),
            503,
            "LLM_UNAVAILABLE",
            "The AI service is busy right now. Please try again in a minute.",
        ),
        (
            LLMRateLimited("Gemini quota 429 exceeded"),
            429,
            "LLM_RATE_LIMITED",
            "The AI service is limiting requests. Please wait a minute and try again.",
        ),
        (
            LLMTimeout("Gemini 504 deadline exceeded"),
            504,
            "LLM_TIMEOUT",
            "The AI service took too long to answer. Please try again.",
        ),
    ],
)
async def test_create_design_llm_errors_return_friendly_envelope_and_store_nothing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
    exc_to_raise: Exception,
    expected_status: int,
    expected_code: str,
    expected_message: str,
) -> None:
    secret_text = "ConfidentialFinancialAlgorithm999"
    secret_brief = RequirementBrief(
        summary=secret_text,
        users="Internal traders",
        data_involved=["trades"],
        domain_hint="finance",
        stated_constraints=[BriefConstraint(id="bc1", text="must be low latency")],
        unverifiable_requirements=[],
        numbers_given=[],
        assumptions=[],
    )

    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[],
            brief=secret_brief.model_dump(by_alias=True),
            status="ready",
        )

    fake_llm = FakeLLMClient([exc_to_raise])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": db_session.id})

    assert res.status_code == expected_status, res.text
    err = error_body(res)
    assert err["code"] == expected_code
    assert err["message"] == expected_message

    # Assert nothing is stored in the database
    async with temp_db_session_factory() as session:
        design = await designs_repo.get_design_by_session_id(session, db_session.id)
        assert design is None
        session_obj = await intake_repo.get_session(session, db_session.id)
        assert session_obj is not None
        assert session_obj.status == "ready"

    # Assert logs contain no user text
    assert secret_text not in caplog.text


@pytest.mark.asyncio
async def test_designs_logs_design_created(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.clear()
    caplog.set_level(logging.INFO)

    secret_summary = "Audit logging unique secret summary 12345"
    brief = RequirementBrief(
        summary=secret_summary,
        users="Audit Team",
        data_involved=["Telemetry"],
        domain_hint="Observability",
        stated_constraints=[BriefConstraint(id="bc1", text="Worker must process orders")],
        unverifiable_requirements=[],
        numbers_given=[],
        assumptions=[],
    )
    async with temp_db_session_factory() as session:
        db_session = await intake_repo.create_session(session, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=session,
            session=db_session,
            transcript=[],
            brief=brief.model_dump(by_alias=True),
            status="ready",
        )

    fake_llm = FakeLLMClient([VALID_SPEC_DICT])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/designs", json={"session_id": db_session.id})

    assert res.status_code == 200, res.text

    # Guard against vacuous truth on empty log records
    assert len(caplog.records) > 0, "Expected non-empty log output from design creation"

    # Parse JSON from each record.getMessage()
    records: list[dict[str, Any]] = []
    for r in caplog.records:
        msg = r.getMessage()
        # Assert no user text appears in the logs
        assert secret_summary not in msg
        try:
            records.append(json.loads(msg))
        except (json.JSONDecodeError, ValueError):
            pass

    assert len(records) > 0, "Expected valid JSON log lines from structlog"
    created_events = [r for r in records if r.get("event") == "design_created"]
    assert len(created_events) == 1, f"Expected 1 design_created event, found: {records}"
    event_payload = created_events[0]

    # Check required fields
    assert "design_id" in event_payload
    assert event_payload["node_count"] == 3
    assert event_payload["prompt_version"] == "architect_v8"
    assert "models" in event_payload
    assert isinstance(event_payload["models"], list)
