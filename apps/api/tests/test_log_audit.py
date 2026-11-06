"""End-to-end sensitive data and confidential log audit test (Phase 8C).

Verifies that zero confidential user strings (intake need, refinement chat,
or prospective client lead details) appear in any log message, log args,
or structured logging record attributes across the entire user journey.
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.dependencies import get_db_session, get_llm_client
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.main import create_app

SENTINEL_NEED: str = "SUPERSECRET_USER_NEED_TEXT_98765"
SENTINEL_CHAT: str = "SUPERSECRET_REFINEMENT_CHAT_54321"
SENTINEL_LEAD_NAME: str = "Sentinel John Doe"
SENTINEL_LEAD_EMAIL: str = "sentinel_lead_user_12345@example.com"
SENTINEL_LEAD_NOTE: str = "SUPERSECRET_CONFIDENTIAL_LEAD_NOTE_11223"

# 1. Intake Turn LLM Output: synthesizes brief with constraint 'bc1'
FAKE_INTAKE_OUTPUT: dict[str, Any] = {
    "action": "ready",
    "questions": [],
    "brief": {
        "summary": "Automated order validation and database sink pipeline.",
        "users": "Customers and operations staff",
        "data_involved": ["Orders", "Payments"],
        "domain_hint": "Commerce",
        "stated_constraints": ["Must process payments via secure worker"],
        "unverifiable_requirements": [],
        "numbers_given": [],
        "assumptions": [],
    },
}

# 2. Architect LLM Output: valid architecture spec with node ids >= 2 chars, covering bc1
FAKE_ARCHITECT_SPEC: dict[str, Any] = {
    "nodes": [
        {
            "id": "gw",
            "name": "API Gateway",
            "type": "api_gateway",
            "role": "Receives payment requests",
            "inputs": [],
            "outputs": ["payment_req"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "wk",
            "name": "Payment Worker",
            "type": "queue_worker",
            "role": "Processes transactions",
            "inputs": ["payment_req"],
            "outputs": ["db_record"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "db",
            "name": "Database Sink",
            "type": "database",
            "role": "Persists records",
            "inputs": ["db_record"],
            "outputs": [],
            "tech_options": [],
            "needs_model": False,
        },
    ],
    "edges": [
        {"from": "gw", "to": "wk", "flows": "Payment Event"},
        {"from": "wk", "to": "db", "flows": "DB Write"},
    ],
    "constraints": [
        {
            "id": "c1",
            "text": "Payments must pass through payment worker",
            "kind": "must_pass_through",
            "node_id": "wk",
            "covers": ["bc1"],
        }
    ],
    "entry_ids": ["gw"],
    "exit_ids": ["db"],
}

# 3. Refinement Chat LLM Output: conversational reply without patches
FAKE_CHAT_OUTPUT: dict[str, Any] = {
    "reply": "I evaluated your suggestion to add audit logging. No architectural patch is required.",
    "patch": None,
}


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
async def test_end_to_end_log_audit_forbids_sentinel_data(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Run real user journey through API and assert zero confidential sentinels appear in any log."""
    caplog.clear()
    caplog.set_level(logging.INFO)

    fake_llm = FakeLLMClient(
        script=[
            FAKE_INTAKE_OUTPUT,
            FAKE_ARCHITECT_SPEC,
            FAKE_CHAT_OUTPUT,
        ]
    )
    app = _create_test_app(temp_db_session_factory, fake_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Step 1: Intake turn containing sensitive need text
        intake_res = await client.post(
            "/api/intake/turn",
            json={"text": f"I need a payment system: {SENTINEL_NEED}"},
        )
        assert intake_res.status_code == 200, intake_res.text
        intake_data = intake_res.json()
        assert intake_data["status"] == "ready"
        session_id = intake_data["session_id"]

        # Step 2: Design generation from the ready session
        design_res = await client.post(
            "/api/designs",
            json={"session_id": session_id},
        )
        assert design_res.status_code == 200, design_res.text
        design_data = design_res.json()
        design_id = design_data["id"]
        version_no = design_data["current_version"]

        # Step 3: Refinement chat containing sensitive message text
        chat_res = await client.post(
            f"/api/designs/{design_id}/chat",
            json={"message": f"Please verify confidential requirement: {SENTINEL_CHAT}"},
        )
        assert chat_res.status_code == 200, chat_res.text

        # Step 4: Lead creation containing sensitive lead contact details (honeypot website omitted)
        lead_res = await client.post(
            "/api/leads",
            json={
                "design_id": design_id,
                "version_no": version_no,
                "name": SENTINEL_LEAD_NAME,
                "email": SENTINEL_LEAD_EMAIL,
                "note": SENTINEL_LEAD_NOTE,
            },
        )
        assert lead_res.status_code == 201, lead_res.text
        assert lead_res.json() == {"status": "received"}

    # Guard against vacuous truth: logs must have been emitted by the journey
    assert len(caplog.records) > 0, "Expected non-empty log output across the user journey"

    sentinels = [
        SENTINEL_NEED,
        SENTINEL_CHAT,
        SENTINEL_LEAD_NAME,
        SENTINEL_LEAD_EMAIL,
        SENTINEL_LEAD_NOTE,
    ]

    # Verify no sentinel appears in any log record message, formatted string, args, or attributes
    for record in caplog.records:
        msg = record.getMessage()
        raw_msg = str(record.msg)
        args_str = str(record.args)

        for s in sentinels:
            assert s not in msg, f"Sentinel '{s}' leaked in formatted log message: {msg}"
            assert s not in raw_msg, f"Sentinel '{s}' leaked in raw log msg: {raw_msg}"
            assert s not in args_str, f"Sentinel '{s}' leaked in log args: {args_str}"

        # Check all custom structlog attributes in record.__dict__
        for attr_name, attr_val in record.__dict__.items():
            if attr_name in ("msg", "args", "message"):
                continue
            val_str = str(attr_val)
            for s in sentinels:
                assert s not in val_str, (
                    f"Sentinel '{s}' leaked in log attribute '{attr_name}': {val_str}"
                )

        # Parse JSON structured logs if present and recursively scan keys and string values
        try:
            parsed = json.loads(msg)
            if isinstance(parsed, dict):

                def _scan_obj(obj: Any) -> None:
                    if isinstance(obj, dict):
                        for k, v in obj.items():
                            for s in sentinels:
                                assert s not in str(k), (
                                    f"Sentinel '{s}' leaked in structured log key: {k}"
                                )
                            _scan_obj(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            _scan_obj(item)
                    elif isinstance(obj, str):
                        for s in sentinels:
                            assert s not in obj, (
                                f"Sentinel '{s}' leaked in structured log string value: {obj}"
                            )

                _scan_obj(parsed)
        except (json.JSONDecodeError, ValueError):
            pass
