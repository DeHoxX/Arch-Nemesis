"""Comprehensive tests for architecture designs generation and retrieval."""

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.dependencies import get_db_session, get_llm_client
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
    unverifiable_requirements=[],
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
    assert data["prompt_version"] == "architect_v1"
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
        assert data["flow_order"] == ["ingress", "worker", "db_sink"]

        # Missing design
        missing_res = await client.get("/api/designs/non-existent-design-id")
        assert missing_res.status_code == 404, missing_res.text
        err = error_body(missing_res)
        assert err["code"] == "NOT_FOUND"
        assert "not found" in err["message"]
