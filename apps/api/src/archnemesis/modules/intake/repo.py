"""Database repository for intake sessions."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import IntakeSessionTable


def _now() -> str:
    return datetime.now(UTC).isoformat()


async def create_session(
    db: AsyncSession,
    transcript: list[dict[str, Any]],
    status: str = "collecting",
    rounds: int = 0,
) -> IntakeSessionTable:
    session_id = str(uuid.uuid4())
    now_str = _now()
    session = IntakeSessionTable(
        id=session_id,
        status=status,
        rounds=rounds,
        turns_json=json.dumps(transcript),
        brief_json=None,
        created_at=now_str,
        updated_at=now_str,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, session_id: str) -> IntakeSessionTable | None:
    stmt = select(IntakeSessionTable).where(IntakeSessionTable.id == session_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_session(
    db: AsyncSession,
    session: IntakeSessionTable,
    transcript: list[dict[str, Any]],
    brief: dict[str, Any] | None,
    status: str,
    rounds: int | None = None,
) -> IntakeSessionTable:
    session.turns_json = json.dumps(transcript)
    session.brief_json = json.dumps(brief) if brief is not None else None
    session.status = status
    if rounds is not None:
        session.rounds = rounds
    session.updated_at = _now()
    await db.commit()
    await db.refresh(session)
    return session


async def update_session_status(db: AsyncSession, session_id: str, status: str) -> None:
    stmt = (
        update(IntakeSessionTable)
        .where(IntakeSessionTable.id == session_id)
        .values(status=status, updated_at=_now())
    )
    await db.execute(stmt)
    await db.commit()
