"""Tests for leads capture, honeypot, validation, privacy, and admin endpoints."""

import json
import logging
import uuid
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import DesignTable, DesignVersionTable, IntakeSessionTable, LeadTable
from archnemesis.dependencies import get_db_session
from archnemesis.main import create_app
from archnemesis.settings import get_settings
from tests.conftest import error_body


def _create_test_app(
    session_factory: async_sessionmaker[AsyncSession],
    admin_token: str | None = None,
) -> Any:
    app = create_app()

    async def _override_get_db() -> Any:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _override_get_db
    return app


async def _seed_design_and_version(
    session_factory: async_sessionmaker[AsyncSession],
    design_id: str = "design-1",
    version_no: int = 1,
) -> None:
    session_id = f"session-{uuid.uuid4()}"
    brief_data = {
        "summary": "Cloud analytics system",
        "users": "Engineering teams",
        "data_involved": ["logs"],
        "domain_hint": "observability",
        "stated_constraints": [{"id": "bc1", "text": "Low latency"}],
        "unverifiable_requirements": [],
        "numbers_given": [{"label": "retention", "value": "30", "unit": "days"}],
        "assumptions": ["Fast network"],
    }
    spec_data = {
        "nodes": [
            {
                "id": "ingress",
                "name": "Ingestion",
                "type": "api_gateway",
                "role": "API ingest",
                "inputs": ["logs"],
                "outputs": ["stream"],
            },
            {
                "id": "processor",
                "name": "Processor",
                "type": "stream_processor",
                "role": "Stream processor",
                "inputs": ["stream"],
                "outputs": ["metrics"],
            },
        ],
        "edges": [{"from": "ingress", "to": "processor", "flows": "Event stream"}],
        "constraints": [{"id": "c1", "text": "Low latency", "kind": "direct"}],
        "entry_ids": ["ingress"],
        "exit_ids": ["processor"],
    }
    explanation_data = {
        "overview": "Overview text.",
        "flow": [{"step": 1, "node_id": "ingress", "node_name": "Ingestion", "text": "Step 1"}],
        "parts": [{"node_id": "ingress", "node_name": "Ingestion", "text": "Part 1"}],
        "checks": [{"constraint_id": "c1", "text": "Checks 1"}],
        "models": {"nodes": [], "text": "No models"},
        "source": "llm",
    }

    async with session_factory() as db:
        intake_row = IntakeSessionTable(
            id=session_id,
            status="ready",
            rounds=1,
            turns_json="[]",
            brief_json=json.dumps(brief_data),
            created_at="2026-10-30T10:00:00Z",
            updated_at="2026-10-30T10:00:00Z",
        )
        db.add(intake_row)
        await db.commit()

        design_row = DesignTable(
            id=design_id,
            intake_session_id=session_id,
            current_version=version_no,
            created_at="2026-10-30T10:00:00Z",
        )
        db.add(design_row)
        await db.commit()

        version_row = DesignVersionTable(
            id=f"ver-{uuid.uuid4()}",
            design_id=design_id,
            version_no=version_no,
            brief_json=json.dumps(brief_data),
            spec_json=json.dumps(spec_data),
            explanation_json=json.dumps(explanation_data),
            prompt_version="v1",
            models_json="{}",
            warnings_json="[]",
            change_note=None,
            created_at="2026-10-30T10:00:00Z",
        )
        db.add(version_row)
        await db.commit()


@pytest.mark.asyncio
async def test_submit_lead_success(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _seed_design_and_version(temp_db_session_factory, "design-abc", 1)
    app = _create_test_app(temp_db_session_factory)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": " Alice Cooper ",
                "email": " alice@example.com ",
                "note": " Need pricing estimate ",
            },
        )

    assert res.status_code == 201, res.text
    assert res.json() == {"status": "received"}

    # Verify database persistence
    async with temp_db_session_factory() as db:
        result = await db.execute(select(LeadTable))
        leads = list(result.scalars().all())
        assert len(leads) == 1
        lead = leads[0]
        assert lead.design_id == "design-abc"
        assert lead.version_no == 1
        assert lead.name == "Alice Cooper"
        assert lead.email == "alice@example.com"
        assert lead.note == "Need pricing estimate"
        assert lead.consent_text_version == "v1"
        assert lead.created_at is not None


@pytest.mark.asyncio
async def test_submit_lead_honeypot_stores_nothing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_design_and_version(temp_db_session_factory, "design-abc", 1)
    app = _create_test_app(temp_db_session_factory)

    bot_name = "Spam Bot Honeypot"
    bot_email = "bot@spammer.org"
    bot_site = "https://spam.org"

    caplog.clear()
    caplog.set_level(logging.INFO)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": bot_name,
                "email": bot_email,
                "website": bot_site,
            },
        )

    assert res.status_code == 201, res.text
    assert res.json() == {"status": "received"}

    # Database must have stored zero leads
    async with temp_db_session_factory() as db:
        result = await db.execute(select(LeadTable))
        leads = list(result.scalars().all())
        assert len(leads) == 0

    # Verify no lead_created event and no honeypot inputs appear in any log record
    assert len(caplog.records) > 0, "Expected request middleware log records"
    for r in caplog.records:
        msg = r.getMessage()
        assert bot_name not in msg
        assert bot_email not in msg
        assert bot_site not in msg
        try:
            d = json.loads(msg)
            assert d.get("event") != "lead_created"
        except (json.JSONDecodeError, ValueError):
            pass


@pytest.mark.asyncio
async def test_submit_lead_unknown_design_returns_404(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = _create_test_app(temp_db_session_factory)

    user_name = "UnknownDesignUser"
    user_email = "unknown@example.com"

    caplog.clear()
    caplog.set_level(logging.INFO)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/leads",
            json={
                "design_id": "non-existent-design",
                "version_no": 1,
                "name": user_name,
                "email": user_email,
            },
        )

    assert res.status_code == 404, res.text
    err = error_body(res)
    assert err["code"] == "NOT_FOUND"

    # Verify no lead_created event and no user text in any log record
    assert len(caplog.records) > 0, "Expected request middleware log records"
    for r in caplog.records:
        msg = r.getMessage()
        assert user_name not in msg
        assert user_email not in msg
        try:
            d = json.loads(msg)
            assert d.get("event") != "lead_created"
        except (json.JSONDecodeError, ValueError):
            pass


@pytest.mark.asyncio
async def test_submit_lead_validation_failures(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _seed_design_and_version(temp_db_session_factory, "design-abc", 1)
    app = _create_test_app(temp_db_session_factory)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Invalid email
        res1 = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": "Bob",
                "email": "not-an-email",
            },
        )
        assert res1.status_code == 422
        assert error_body(res1)["code"] == "INPUT_INVALID"

        # Empty name
        res2 = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": "   ",
                "email": "bob@example.com",
            },
        )
        assert res2.status_code == 422
        assert error_body(res2)["code"] == "INPUT_INVALID"

        # Note exceeding 500 characters
        res3 = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": "Bob",
                "email": "bob@example.com",
                "note": "A" * 501,
            },
        )
        assert res3.status_code == 422
        assert error_body(res3)["code"] == "INPUT_INVALID"


@pytest.mark.asyncio
async def test_lead_privacy_and_logging_safety(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_design_and_version(temp_db_session_factory, "design-abc", 1)
    app = _create_test_app(temp_db_session_factory)

    secret_name = "SuperSecretLeadName"
    secret_email = "secret_lead_email@example.com"
    secret_note = "SuperSecretConfidentialNoteContent"

    # Capture logs during valid submission at INFO level
    caplog.clear()
    caplog.set_level(logging.INFO)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": secret_name,
                "email": secret_email,
                "note": secret_note,
            },
        )
    assert res.status_code == 201

    # Guard against vacuous truth on empty log records
    assert len(caplog.records) > 0, "Expected non-empty log output from submission"

    # Parse JSON from each record.getMessage()
    records: list[dict[str, Any]] = []
    for r in caplog.records:
        msg = r.getMessage()
        assert secret_name not in msg
        assert secret_email not in msg
        assert secret_note not in msg
        try:
            records.append(json.loads(msg))
        except (json.JSONDecodeError, ValueError):
            pass

    assert len(records) > 0, "Expected valid JSON log lines from structlog"
    lead_created_events = [r for r in records if r.get("event") == "lead_created"]
    assert len(lead_created_events) == 1
    event_payload = lead_created_events[0]

    # Keys must be only lead_id plus standard fields (event, request_id, level, timestamp)
    expected_standard_and_lead_keys = {"event", "request_id", "level", "timestamp", "lead_id"}
    assert set(event_payload.keys()) == expected_standard_and_lead_keys
    assert "lead_id" in event_payload
    assert "name" not in event_payload
    assert "email" not in event_payload
    assert "note" not in event_payload

    # Verify 422 response body and logs do not echo raw invalid personal input
    invalid_email_input = "leaked_input_should_not_appear@invalid_domain_foo"
    invalid_name_input = "PrivateNameIn422"
    caplog.clear()
    caplog.set_level(logging.INFO)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_bad = await client.post(
            "/api/leads",
            json={
                "design_id": "design-abc",
                "version_no": 1,
                "name": invalid_name_input,
                "email": invalid_email_input,
            },
        )
    assert res_bad.status_code == 422
    assert invalid_email_input not in res_bad.text
    assert invalid_name_input not in res_bad.text
    assert len(caplog.records) > 0, "Expected non-empty log output for 422 failure"
    for r in caplog.records:
        msg = r.getMessage()
        assert invalid_email_input not in msg
        assert invalid_name_input not in msg
        try:
            d = json.loads(msg)
            assert d.get("event") != "lead_created"
        except (json.JSONDecodeError, ValueError):
            pass


@pytest.mark.asyncio
async def test_admin_auth_unset_or_empty_token_returns_404(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Unset token
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    get_settings.cache_clear()

    app = _create_test_app(temp_db_session_factory)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.get("/api/admin/leads")
        assert res1.status_code == 404
        assert error_body(res1)["code"] == "NOT_FOUND"

        res2 = await client.get("/api/admin/designs/design-1/versions/1")
        assert res2.status_code == 404
        assert error_body(res2)["code"] == "NOT_FOUND"

    # Empty token
    monkeypatch.setenv("ADMIN_TOKEN", "   ")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res3 = await client.get("/api/admin/leads")
        assert res3.status_code == 404


@pytest.mark.asyncio
async def test_admin_auth_missing_or_wrong_token_returns_401(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "correct-admin-secret")
    get_settings.cache_clear()

    app = _create_test_app(temp_db_session_factory)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Missing token header
        res_missing = await client.get("/api/admin/leads")
        assert res_missing.status_code == 401
        err_missing = error_body(res_missing)
        assert err_missing["code"] == "UNAUTHORIZED"
        assert err_missing["message"] == "Not authorised."

        # Wrong token header
        res_wrong = await client.get(
            "/api/admin/leads",
            headers={"X-Admin-Token": "incorrect-token"},
        )
        assert res_wrong.status_code == 401
        err_wrong = error_body(res_wrong)
        assert err_wrong["code"] == "UNAUTHORIZED"
        assert err_wrong["message"] == "Not authorised."


@pytest.mark.asyncio
async def test_admin_list_leads_and_inspection(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "super-secret-token")
    get_settings.cache_clear()

    await _seed_design_and_version(temp_db_session_factory, "design-xyz", 1)
    app = _create_test_app(temp_db_session_factory)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Submit two leads
        await client.post(
            "/api/leads",
            json={
                "design_id": "design-xyz",
                "version_no": 1,
                "name": "Lead One",
                "email": "lead1@example.com",
            },
        )
        await client.post(
            "/api/leads",
            json={
                "design_id": "design-xyz",
                "version_no": 1,
                "name": "Lead Two",
                "email": "lead2@example.com",
                "note": "Followup urgently",
            },
        )

        # GET /api/admin/leads with correct token
        headers = {"X-Admin-Token": "super-secret-token"}
        res = await client.get("/api/admin/leads", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert len(data) == 2
        # Verify fields in lead item per BUILD_PLAN.md:504
        first = data[0]
        assert "id" in first
        assert "created_at" in first
        assert "name" in first
        assert "email" in first
        assert "note" in first
        assert "design_id" in first
        assert "version_no" in first
        assert first["design_id"] == "design-xyz"
        assert first["version_no"] == 1

        # Test limit query param
        res_limit = await client.get("/api/admin/leads?limit=1", headers=headers)
        assert res_limit.status_code == 200
        assert len(res_limit.json()) == 1

        # GET /api/admin/designs/{id}/versions/{n}
        res_design = await client.get(
            "/api/admin/designs/design-xyz/versions/1",
            headers=headers,
        )
        assert res_design.status_code == 200, res_design.text
        design_data = res_design.json()
        assert "brief" in design_data
        assert "spec" in design_data
        assert "warnings" in design_data
        assert "flow_order" in design_data
        assert "explanation" in design_data
        assert design_data["flow_order"] == ["ingress", "processor"]
        assert design_data["explanation"]["source"] == "llm"

        # Non-existent version
        res_missing_design = await client.get(
            "/api/admin/designs/design-xyz/versions/99",
            headers=headers,
        )
        assert res_missing_design.status_code == 404
        assert error_body(res_missing_design)["code"] == "NOT_FOUND"
