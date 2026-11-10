"""Tests for batch titles endpoint (POST /api/designs/titles) and backfill script."""

import io
import json
import uuid
from collections.abc import AsyncGenerator
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import DesignTable, DesignVersionTable, IntakeSessionTable
from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app
from archnemesis.modules.designs.backfill import run_backfill
from archnemesis.modules.designs.title import fallback_title

BRIEF_1_SUMMARY = "An automated claims processing engine for insurance."
BRIEF_2_SUMMARY = "Development of a customer support assistant for inquiries."
BRIEF_2_DOMAIN_HINT = "Support"

BRIEF_1: dict[str, Any] = {
    "summary": BRIEF_1_SUMMARY,
    "users": "Adjusters",
    "data_involved": ["Claims"],
    "domain_hint": "Insurance",
    "stated_constraints": [],
    "unverifiable_requirements": [],
    "numbers_given": [],
    "assumptions": [],
}

BRIEF_2: dict[str, Any] = {
    "summary": BRIEF_2_SUMMARY,
    "users": "Customers",
    "data_involved": ["Tickets"],
    "domain_hint": BRIEF_2_DOMAIN_HINT,
    "stated_constraints": [],
    "unverifiable_requirements": [],
    "numbers_given": [],
    "assumptions": [],
}


def _create_test_app(
    db_factory: async_sessionmaker[AsyncSession],
    llm: FakeLLMClient | None = None,
) -> Any:
    app = create_app()

    async def override_db() -> AsyncGenerator[AsyncSession, None]:
        async with db_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_db
    if llm is not None:
        app.dependency_overrides[get_llm_client] = lambda: llm
    return app


async def _seed_design(
    session: AsyncSession,
    design_id: str,
    title: str | None,
    brief_dict: dict[str, Any],
) -> None:
    session_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())

    intake_session = IntakeSessionTable(
        id=session_id,
        status="designed",
        rounds=1,
        turns_json="[]",
        brief_json=json.dumps(brief_dict),
        created_at="2026-11-07T00:00:00Z",
        updated_at="2026-11-07T00:00:00Z",
    )
    session.add(intake_session)
    await session.commit()

    design = DesignTable(
        id=design_id,
        intake_session_id=session_id,
        title=title,
        current_version=1,
        created_at="2026-11-07T00:00:00Z",
    )
    version = DesignVersionTable(
        id=version_id,
        design_id=design_id,
        version_no=1,
        brief_json=json.dumps(brief_dict),
        spec_json=json.dumps({"nodes": [], "edges": [], "constraints": []}),
        explanation_json=None,
        prompt_version="v1",
        models_json=json.dumps({"architect": "test"}),
        warnings_json="[]",
        change_note=None,
        created_at="2026-11-07T00:00:00Z",
    )
    session.add(design)
    session.add(version)
    await session.commit()


# ==============================================================================
# Endpoint Tests (POST /api/designs/titles)
# ==============================================================================


@pytest.mark.asyncio
async def test_batch_titles_returns_stored_and_heuristic_and_omits_unknown(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    d1_id = str(uuid.uuid4())
    d2_id = str(uuid.uuid4())
    unknown_id = str(uuid.uuid4())

    async with temp_db_session_factory() as session:
        await _seed_design(session, d1_id, "Insurance Claims Engine", BRIEF_1)
        await _seed_design(session, d2_id, None, BRIEF_2)

    app = _create_test_app(temp_db_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/designs/titles",
            json={"ids": [d1_id, d2_id, unknown_id]},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert "titles" in data
        titles = data["titles"]

        # 1. Stored title returned
        assert titles.get(d1_id) == "Insurance Claims Engine"

        # 2. Heuristic returned for NULL title
        expected_heuristic = fallback_title(BRIEF_2_SUMMARY, BRIEF_2_DOMAIN_HINT)
        assert titles.get(d2_id) == expected_heuristic

        # 3. Unknown ID omitted without 404
        assert unknown_id not in titles
        assert len(titles) == 2


@pytest.mark.asyncio
async def test_batch_titles_empty_list_returns_empty_map(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _create_test_app(temp_db_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/designs/titles", json={"ids": []})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data == {"titles": {}}


@pytest.mark.asyncio
async def test_batch_titles_validates_limits_422(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _create_test_app(temp_db_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # > 200 IDs
        too_many_ids = [str(uuid.uuid4()) for _ in range(201)]
        res_too_many = await client.post("/api/designs/titles", json={"ids": too_many_ids})
        assert res_too_many.status_code == 422

        # > 36-char ID
        oversized_id = "a" * 37
        res_oversized = await client.post("/api/designs/titles", json={"ids": [oversized_id]})
        assert res_oversized.status_code == 422


@pytest.mark.asyncio
async def test_batch_titles_response_contains_no_brief_or_spec_data(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    d1_id = str(uuid.uuid4())
    async with temp_db_session_factory() as session:
        await _seed_design(session, d1_id, "Claims Engine", BRIEF_1)

    app = _create_test_app(temp_db_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/designs/titles", json={"ids": [d1_id]})
        assert res.status_code == 200
        data = res.json()
        assert set(data.keys()) == {"titles"}
        assert "brief" not in data
        assert "spec" not in data


# ==============================================================================
# Backfill Script Tests (scripts/backfill_titles.py)
# ==============================================================================


@pytest.mark.asyncio
async def test_backfill_dry_run_prints_candidate_details_and_changes_nothing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    d1_id = str(uuid.uuid4())
    async with temp_db_session_factory() as session:
        await _seed_design(session, d1_id, None, BRIEF_1)

    expected_proposed = fallback_title(BRIEF_1_SUMMARY, "Insurance")

    stdout_buf = io.StringIO()
    with redirect_stdout(stdout_buf):
        counts = await run_backfill(
            db_factory=temp_db_session_factory,
            apply=False,
        )

    output = stdout_buf.getvalue()
    assert counts["null_count"] == 1
    assert counts["total"] == 1
    assert counts["already_titled"] == 0
    assert "Backfill dry run:" in output

    # Assert candidate details printed: design_id, current (<NULL>), proposed title
    assert d1_id in output
    assert "<NULL>" in output
    assert expected_proposed in output

    # Assert brief summary text is NEVER printed
    assert BRIEF_1_SUMMARY not in output

    # Assert database record was NOT changed
    async with temp_db_session_factory() as session:
        row = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d1_id))
        ).scalar()
        assert row is None


@pytest.mark.asyncio
async def test_backfill_apply_refuses_without_valid_backup(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    d1_id = str(uuid.uuid4())
    async with temp_db_session_factory() as session:
        await _seed_design(session, d1_id, None, BRIEF_1)

    live_db_file = tmp_path / "live.db"
    live_db_file.write_text("live db mock data")

    # 1. Missing backup_path
    with pytest.raises(ValueError, match="Missing required --backup-path"):
        await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db_file,
            backup_path=None,
            apply=True,
        )

    # 2. Non-existent backup file
    non_existent = tmp_path / "missing.bak"
    with pytest.raises(ValueError, match="Backup file does not exist"):
        await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db_file,
            backup_path=non_existent,
            apply=True,
        )

    # 3. Empty backup file (0 bytes)
    empty_backup = tmp_path / "empty.bak"
    empty_backup.write_bytes(b"")
    with pytest.raises(ValueError, match="Backup file is empty"):
        await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db_file,
            backup_path=empty_backup,
            apply=True,
        )

    # 4. Same path as live database
    with pytest.raises(ValueError, match="Backup file cannot be the same path"):
        await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db_file,
            backup_path=live_db_file,
            apply=True,
        )

    # Verify DB was untouched across all failure attempts
    async with temp_db_session_factory() as session:
        row = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d1_id))
        ).scalar()
        assert row is None


@pytest.mark.asyncio
async def test_backfill_apply_populates_null_and_preserves_existing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    d1_id = str(uuid.uuid4())
    d2_id = str(uuid.uuid4())
    async with temp_db_session_factory() as session:
        await _seed_design(session, d1_id, None, BRIEF_1)
        await _seed_design(session, d2_id, "Existing Kept Title", BRIEF_2)

    live_db = tmp_path / "arch_nemesis.db"
    live_db.write_text("live db mock data")
    backup_db = tmp_path / "arch_nemesis.db.bak"
    backup_db.write_text("backup db mock data")

    stdout_buf = io.StringIO()
    with redirect_stdout(stdout_buf):
        counts = await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db,
            backup_path=backup_db,
            apply=True,
        )

    output = stdout_buf.getvalue()
    assert counts["updated"] == 1
    assert counts["failed"] == 0
    assert "Backfill completed:" in output
    assert "Updated: 1" in output

    expected_t1 = fallback_title(BRIEF_1_SUMMARY, "Insurance")

    # Verify d1 got populated with deterministic fallback_title and d2 kept its existing title
    async with temp_db_session_factory() as session:
        t1 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d1_id))
        ).scalar()
        t2 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d2_id))
        ).scalar()
        assert t1 == expected_t1
        assert t2 == "Existing Kept Title"

    # Assert brief text was NEVER printed
    assert BRIEF_1_SUMMARY not in output


@pytest.mark.asyncio
async def test_backfill_disambiguates_duplicates_and_preserves_existing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    # 1 existing titled design + 4 NULL-title designs sharing identical brief summary
    identical_brief: dict[str, Any] = {
        "summary": "An automated claims processing engine for insurance.",
        "domain_hint": "Insurance",
        "data_involved": ["Claims"],
    }
    existing_id = str(uuid.uuid4())
    d1_id = str(uuid.uuid4())
    d2_id = str(uuid.uuid4())
    d3_id = str(uuid.uuid4())
    d4_id = str(uuid.uuid4())

    async with temp_db_session_factory() as session:
        await _seed_design(
            session,
            existing_id,
            "Claims Processing Engine For Insurance",
            identical_brief,
        )
        await _seed_design(session, d1_id, None, identical_brief)
        await _seed_design(session, d2_id, None, identical_brief)
        await _seed_design(session, d3_id, None, identical_brief)
        await _seed_design(session, d4_id, None, identical_brief)

    live_db = tmp_path / "arch_nemesis.db"
    live_db.write_text("live db mock data")
    backup_db = tmp_path / "arch_nemesis.db.bak"
    backup_db.write_text("backup db mock data")

    # 1. Dry run execution
    stdout_buf_dry = io.StringIO()
    with redirect_stdout(stdout_buf_dry):
        dry_counts = await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db,
            backup_path=backup_db,
            apply=False,
        )

    dry_out = stdout_buf_dry.getvalue()
    assert dry_counts["null_count"] == 4
    assert dry_counts["already_titled"] == 1

    # Extract proposed titles from dry-run output
    dry_titles: list[str] = []
    for line in dry_out.splitlines():
        if line.startswith("Candidate: "):
            parts = line.split(" | proposed: ")
            if len(parts) == 2:
                dry_titles.append(parts[1].strip())

    assert len(dry_titles) == 4
    # All proposed titles must be mutually distinct and distinct from existing title
    assert len(set(dry_titles)) == 4
    assert "Claims Processing Engine For Insurance" not in dry_titles

    # 2. Apply execution
    stdout_buf_apply = io.StringIO()
    with redirect_stdout(stdout_buf_apply):
        apply_counts = await run_backfill(
            db_factory=temp_db_session_factory,
            live_db_path=live_db,
            backup_path=backup_db,
            apply=True,
        )

    assert apply_counts["updated"] == 4
    assert apply_counts["failed"] == 0

    # 3. Verify database state: applied titles match dry-run proposed exactly, existing untouched
    async with temp_db_session_factory() as session:
        t_exist = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == existing_id))
        ).scalar()
        t1 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d1_id))
        ).scalar()
        t2 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d2_id))
        ).scalar()
        t3 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d3_id))
        ).scalar()
        t4 = (
            await session.execute(select(DesignTable.title).where(DesignTable.id == d4_id))
        ).scalar()

    assert t_exist == "Claims Processing Engine For Insurance"
    applied_titles = [t1, t2, t3, t4]
    assert applied_titles == dry_titles

    # Assert brief summary was NEVER printed in dry-run or apply output
    assert identical_brief["summary"] not in dry_out
    assert identical_brief["summary"] not in stdout_buf_apply.getvalue()
