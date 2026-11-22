"""Shared seed helper for models test suite (Stage 6B fix)."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import DesignTable, DesignVersionTable, IntakeSessionTable
from archnemesis.modules.validation.models import ArchitectureSpec

AI_NODE_ID = "node_ai"
NON_AI_NODE_ID = "node_non_ai"


def default_nodes() -> list[dict[str, Any]]:
    return [
        {
            "id": AI_NODE_ID,
            "name": "Document Classifier",
            "type": "classifier",
            "role": "Classify incoming invoices using OCR vision",
            "inputs": ["doc"],
            "outputs": ["category"],
            "tech_options": [],
            "needs_model": True,
            "ai_role": "model",
            "tools": [],
        },
        {
            "id": NON_AI_NODE_ID,
            "name": "Database Store",
            "type": "database",
            "role": "Store classified rows",
            "inputs": ["category"],
            "outputs": [],
            "tech_options": [],
            "needs_model": False,
            "ai_role": "none",
            "tools": [],
        },
    ]


def make_spec(nodes: list[dict[str, Any]] | None = None) -> str:
    spec_dict = {
        "nodes": nodes if nodes is not None else default_nodes(),
        "edges": [
            {
                "from": AI_NODE_ID,
                "to": NON_AI_NODE_ID,
                "flows": "Category record",
            }
        ],
        "constraints": [
            {
                "id": "c1",
                "text": "All internal traffic must use TLS.",
                "kind": "security",
                "node_id": None,
                "a": None,
                "b": None,
                "covers": ["bc1"],
            }
        ],
        "entry_ids": [AI_NODE_ID],
        "exit_ids": [NON_AI_NODE_ID],
    }
    # Validate early so helper catches any invalid specs
    ArchitectureSpec.model_validate(spec_dict)
    return json.dumps(spec_dict)


async def seed_design_chain(
    db: AsyncSession,
    design_id: str = "d-test-1",
    version_no: int = 1,
    nodes: list[dict[str, Any]] | None = None,
    title: str = "Test Design",
) -> tuple[DesignTable, DesignVersionTable]:
    """Seed full database chain required by relational foreign keys:

    1. IntakeSessionTable row (with unique session_id)
    2. DesignTable row (linking intake_session_id)
    3. DesignVersionTable row (linking design_id and version_no with valid spec)
    """
    now_iso = datetime.now(UTC).isoformat()
    session_id = f"session-{uuid4().hex[:8]}"

    session = IntakeSessionTable(
        id=session_id,
        status="designed",
        rounds=1,
        turns_json="[]",
        brief_json="{}",
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(session)
    await db.flush()

    design = DesignTable(
        id=design_id,
        intake_session_id=session.id,
        current_version=version_no,
        created_at=now_iso,
        title=title,
    )
    db.add(design)
    await db.flush()

    version = DesignVersionTable(
        id=f"ver-{uuid4().hex[:8]}",
        design_id=design_id,
        version_no=version_no,
        brief_json="{}",
        spec_json=make_spec(nodes),
        prompt_version="architect_v10",
        models_json="{}",
        warnings_json="[]",
        change_note=None,
        created_at=now_iso,
    )
    db.add(version)
    await db.commit()
    await db.refresh(design)
    await db.refresh(version)

    return design, version
