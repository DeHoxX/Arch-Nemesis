"""Database repository for the explainer module."""

import json

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import DesignTable, DesignVersionTable
from archnemesis.modules.explainer.schemas import Explanation


async def get_design(db: AsyncSession, design_id: str) -> DesignTable | None:
    """Retrieve design row by ID."""
    stmt = select(DesignTable).where(DesignTable.id == design_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_design_version(
    db: AsyncSession, design_id: str, version_no: int
) -> DesignVersionTable | None:
    """Retrieve design version record by design ID and version number."""
    stmt = select(DesignVersionTable).where(
        DesignVersionTable.design_id == design_id,
        DesignVersionTable.version_no == version_no,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def save_explanation(
    db: AsyncSession,
    design_id: str,
    version_no: int,
    explanation: Explanation,
) -> Explanation:
    """Conditionally save explanation_json if not yet populated.

    Uses UPDATE ... WHERE explanation_json IS NULL. If rowcount is 0,
    re-reads and returns the already-stored explanation to guarantee
    idempotent concurrency protection without retrying.
    """
    raw_json = json.dumps(explanation.model_dump())
    stmt = (
        update(DesignVersionTable)
        .where(
            DesignVersionTable.design_id == design_id,
            DesignVersionTable.version_no == version_no,
            DesignVersionTable.explanation_json.is_(None),
        )
        .values(explanation_json=raw_json)
    )
    result = await db.execute(stmt)
    await db.commit()

    if isinstance(result, CursorResult) and result.rowcount == 0:
        # Re-read the stored record populated by a concurrent worker
        version = await get_design_version(db, design_id, version_no)
        if version is not None and version.explanation_json is not None:
            return Explanation.model_validate(json.loads(version.explanation_json))

    return explanation
