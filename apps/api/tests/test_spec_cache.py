"""Tests for architecture specification cache (Phase 8B)."""

import json
import logging
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import DesignTable
from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.errors import DesignFailedError
from archnemesis.llm.base import LLMClient
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app
from archnemesis.modules.architect.service import ARCHITECT_PROMPT_NAME
from archnemesis.modules.designs import repo as designs_repo
from archnemesis.modules.designs.schemas import CreateDesignRequest
from archnemesis.modules.intake import repo as intake_repo
from archnemesis.settings import get_settings
from archnemesis.shared.brief import BriefConstraint, RequirementBrief

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

VALID_SPEC_DICT: dict[str, Any] = {
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

INVALID_SPEC_CYCLE: dict[str, Any] = {
    "nodes": [
        {
            "id": "node_a",
            "name": "Node A",
            "type": "service",
            "role": "Service A",
            "inputs": [],
            "outputs": ["data_a"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "node_b",
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
        {"from": "node_a", "to": "node_b", "flows": "flow_1"},
        {"from": "node_b", "to": "node_a", "flows": "flow_2"},
    ],
    "constraints": [],
    "entry_ids": ["node_a"],
    "exit_ids": ["node_b"],
}


def _create_test_app(
    db_factory: async_sessionmaker[AsyncSession],
    llm: FakeLLMClient,
) -> Any:
    app = create_app()

    async def override_db() -> AsyncGenerator[AsyncSession, None]:
        async with db_factory() as session:
            yield session

    def override_llm() -> LLMClient:
        return llm

    app.dependency_overrides[get_db_session] = override_db
    app.dependency_overrides[get_llm_client] = override_llm
    return app


@pytest.mark.asyncio
async def test_spec_cache_miss_calls_llm_and_stores_hit_makes_zero_calls_and_creates_new_row(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A cache miss invokes the LLM once and saves to spec_cache; a hit makes 0 LLM calls and creates a distinct design row."""
    caplog.clear()
    caplog.set_level(logging.INFO)

    fake_llm = FakeLLMClient(script=[VALID_SPEC_DICT])
    app = _create_test_app(temp_db_session_factory, fake_llm)

    from archnemesis.modules.designs.service import compute_spec_cache_key

    async with temp_db_session_factory() as db:
        # 1. Setup Session 1
        s1 = await intake_repo.create_session(db, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=db,
            session=s1,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

        # 2. Setup Session 2 with the EXACT same brief
        s2 = await intake_repo.create_session(db, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=db,
            session=s2,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

    settings = get_settings()
    cache_key = compute_spec_cache_key(
        SAMPLE_BRIEF, ARCHITECT_PROMPT_NAME, settings.llm_model_architect or ""
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Initial call: cache miss -> LLM invoked once
        res1 = await client.post("/api/designs", json={"session_id": s1.id})
        assert res1.status_code == 200, res1.text
        data1 = res1.json()
        assert len(fake_llm.calls) == 1
        assert data1["prompt_version"] == ARCHITECT_PROMPT_NAME
        assert data1["explanation"] is None

        # Verify entry exists in spec_cache
        async with temp_db_session_factory() as db:
            cached = await designs_repo.get_cached_spec(db, cache_key)
            assert cached is not None
            assert cached.key == cache_key

        # Second call: cache hit -> ZERO new LLM calls
        res2 = await client.post("/api/designs", json={"session_id": s2.id})
        assert res2.status_code == 200, res2.text
        data2 = res2.json()
        assert len(fake_llm.calls) == 1, "Expected zero new LLM calls on cache hit"

        # Assert two distinct design rows created for two different sessions
        assert data2["id"] != data1["id"], (
            "Expected distinct design IDs for different user sessions"
        )
        assert data2["intake_session_id"] == s2.id
        assert data1["intake_session_id"] == s1.id

        # Assert prompt_version label on cache hit ends with ' (cached)'
        assert data2["prompt_version"] == f"{ARCHITECT_PROMPT_NAME} (cached)"

        # Verify two rows exist in designs table
        async with temp_db_session_factory() as db:
            stmt = select(DesignTable)
            result = await db.execute(stmt)
            designs = result.scalars().all()
            assert len(designs) == 2

    # Verify log output: non-empty caplog guard and parse JSON from getMessage
    assert len(caplog.records) > 0, "Non-empty caplog guard failed"
    canary = SAMPLE_BRIEF.summary
    records: list[dict[str, Any]] = []
    for r in caplog.records:
        msg = r.getMessage()
        # Assert canary and unverifiable text absent from all logs
        assert canary not in msg
        assert "Latency must feel instant" not in msg
        try:
            records.append(json.loads(msg))
        except (json.JSONDecodeError, ValueError):
            pass

    assert len(records) > 0, "Expected valid JSON log lines from structlog"
    cache_events = [r for r in records if r.get("event") == "spec_cache_event"]
    assert len(cache_events) == 2, f"Expected 2 spec_cache_event logs, got: {records}"

    # Call 1: cache miss
    assert cache_events[0]["cache_hit"] is False
    assert len(cache_events[0]["key_prefix"]) == 8
    assert cache_events[0]["key_prefix"] == cache_key[:8]

    # Call 2: cache hit
    assert cache_events[1]["cache_hit"] is True
    assert len(cache_events[1]["key_prefix"]) == 8
    assert cache_events[1]["key_prefix"] == cache_key[:8]


def test_cache_key_deterministic_regardless_of_dict_order() -> None:
    """The cache key is computed from canonical JSON with sort_keys=True, yielding identical hashes."""
    from archnemesis.modules.designs.service import compute_spec_cache_key

    brief_a = RequirementBrief(
        summary="A",
        users="B",
        data_involved=["x", "y"],
        domain_hint="hint",
        stated_constraints=[BriefConstraint(id="bc1", text="Must be secure")],
        unverifiable_requirements=[],
        numbers_given=[],
        assumptions=["assume 1"],
    )
    brief_b = RequirementBrief(
        assumptions=["assume 1"],
        numbers_given=[],
        unverifiable_requirements=[],
        stated_constraints=[BriefConstraint(text="Must be secure", id="bc1")],
        domain_hint="hint",
        data_involved=["x", "y"],
        users="B",
        summary="A",
    )

    key_a = compute_spec_cache_key(brief_a, "v1", "model_x")
    key_b = compute_spec_cache_key(brief_b, "v1", "model_x")
    assert key_a == key_b
    assert len(key_a) == 64


@pytest.mark.asyncio
async def test_spec_cache_expired_entry_triggers_miss_and_eviction(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An expired cache entry (> 7 days) is deleted and treated as a miss."""
    from archnemesis.modules.designs.service import compute_spec_cache_key, create_design

    fake_llm = FakeLLMClient(script=[VALID_SPEC_DICT])
    settings = get_settings()
    cache_key = compute_spec_cache_key(
        SAMPLE_BRIEF, ARCHITECT_PROMPT_NAME, settings.llm_model_architect or ""
    )

    # Inject an entry created 8 days ago
    expired_time = (datetime.now(UTC) - timedelta(days=8)).isoformat()
    async with temp_db_session_factory() as db:
        await designs_repo.set_cached_spec(
            db=db,
            key=cache_key,
            spec_dict=VALID_SPEC_DICT,
            created_at=expired_time,
        )

        s = await intake_repo.create_session(db, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=db,
            session=s,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

        # create_design should detect expiration, delete expired row, and invoke LLM
        req = CreateDesignRequest(session_id=s.id)
        res = await create_design(db, req, fake_llm)

        assert len(fake_llm.calls) == 1, "Expected LLM call because cache was expired"
        assert res.prompt_version == ARCHITECT_PROMPT_NAME, (
            "Expected fresh generation prompt version"
        )

        # The new cache entry should have fresh created_at
        fresh_cached = await designs_repo.get_cached_spec(db, cache_key)
        assert fresh_cached is not None
        fresh_time = datetime.fromisoformat(fresh_cached.created_at)
        assert (datetime.now(UTC) - fresh_time).total_seconds() < 60.0


@pytest.mark.asyncio
async def test_spec_cache_invalid_failing_spec_never_stored(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """If generation or repair fails validation, the invalid spec is NEVER stored in spec_cache."""
    from archnemesis.modules.designs.service import compute_spec_cache_key, create_design

    fake_llm = FakeLLMClient(
        script=[
            INVALID_SPEC_CYCLE,
            INVALID_SPEC_CYCLE,
            INVALID_SPEC_CYCLE,
        ]
    )
    settings = get_settings()
    cache_key = compute_spec_cache_key(
        SAMPLE_BRIEF, ARCHITECT_PROMPT_NAME, settings.llm_model_architect or ""
    )

    async with temp_db_session_factory() as db:
        s = await intake_repo.create_session(db, transcript=[], status="collecting")
        await intake_repo.update_session(
            db=db,
            session=s,
            transcript=[],
            brief=SAMPLE_BRIEF.model_dump(by_alias=True),
            status="ready",
        )

        req = CreateDesignRequest(session_id=s.id)
        with pytest.raises(DesignFailedError):
            await create_design(db, req, fake_llm)

        # spec_cache must NOT contain the failing key
        cached = await designs_repo.get_cached_spec(db, cache_key)
        assert cached is None, "Failing spec must never be cached"
