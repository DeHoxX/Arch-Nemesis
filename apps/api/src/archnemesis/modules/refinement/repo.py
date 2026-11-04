"""Database repository operations for refinement chat, patches, and version control."""

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import (
    ChatMessageTable,
    DesignTable,
    DesignVersionTable,
    PatchTable,
)


async def get_design(db: AsyncSession, design_id: str) -> DesignTable | None:
    """Retrieve DesignTable record by design ID."""
    stmt = select(DesignTable).where(DesignTable.id == design_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_design_version(
    db: AsyncSession, design_id: str, version_no: int
) -> DesignVersionTable | None:
    """Retrieve specific DesignVersionTable record by design ID and version number."""
    stmt = select(DesignVersionTable).where(
        DesignVersionTable.design_id == design_id,
        DesignVersionTable.version_no == version_no,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def count_refinement_turns(db: AsyncSession, design_id: str) -> int:
    """Count user refinement turns (user chat messages + distinct suggestion requests)."""
    # Count user messages
    stmt_chat = (
        select(func.count())
        .select_from(ChatMessageTable)
        .where(
            ChatMessageTable.design_id == design_id,
            ChatMessageTable.role == "user",
        )
    )
    chat_result = await db.execute(stmt_chat)
    user_chat_count = chat_result.scalar_one() or 0

    # Count distinct suggestion runs (grouped by created_at)
    stmt_sugg = select(func.count(func.distinct(PatchTable.created_at))).where(
        PatchTable.design_id == design_id,
        PatchTable.kind == "suggestion",
    )
    sugg_result = await db.execute(stmt_sugg)
    sugg_count = sugg_result.scalar_one() or 0

    return user_chat_count + sugg_count


async def get_recent_messages(
    db: AsyncSession, design_id: str, limit: int = 6
) -> list[ChatMessageTable]:
    """Retrieve the most recent messages for a design, returned in chronological order."""
    stmt = (
        select(ChatMessageTable)
        .where(ChatMessageTable.design_id == design_id)
        .order_by(ChatMessageTable.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = list(result.scalars().all())
    messages.reverse()
    return messages


async def get_all_messages(db: AsyncSession, design_id: str) -> list[ChatMessageTable]:
    """Retrieve all chat messages for a design in chronological order."""
    stmt = (
        select(ChatMessageTable)
        .where(ChatMessageTable.design_id == design_id)
        .order_by(ChatMessageTable.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_chat_message(
    db: AsyncSession,
    message_id: str,
    design_id: str,
    role: str,
    text: str,
    created_at: str,
) -> ChatMessageTable:
    """Insert a new chat message into chat_messages."""
    record = ChatMessageTable(
        id=message_id,
        design_id=design_id,
        role=role,
        text=text,
        created_at=created_at,
    )
    db.add(record)
    await db.flush()
    return record


async def create_patch(
    db: AsyncSession,
    patch_id: str,
    design_id: str,
    kind: str,
    base_version: int,
    status: str,
    patch_json: str,
    diff_json: str | None,
    issues_json: str,
    reason: str | None,
    created_at: str,
) -> PatchTable:
    """Insert a candidate patch record."""
    record = PatchTable(
        id=patch_id,
        design_id=design_id,
        kind=kind,
        base_version=base_version,
        status=status,
        patch_json=patch_json,
        diff_json=diff_json,
        issues_json=issues_json,
        reason=reason,
        created_at=created_at,
        decided_at=None,
    )
    db.add(record)
    await db.flush()
    return record


async def get_patch(db: AsyncSession, design_id: str, patch_id: str) -> PatchTable | None:
    """Retrieve patch record by design ID and patch ID."""
    stmt = select(PatchTable).where(
        PatchTable.design_id == design_id,
        PatchTable.id == patch_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_patch_status(
    db: AsyncSession, patch_id: str, status: str, decided_at: str
) -> None:
    """Update status and decided_at for a patch."""
    stmt = (
        update(PatchTable)
        .where(PatchTable.id == patch_id)
        .values(status=status, decided_at=decided_at)
    )
    await db.execute(stmt)


async def supersede_other_patches(
    db: AsyncSession, design_id: str, base_version: int, accepted_patch_id: str, decided_at: str
) -> None:
    """Mark all competing proposed or needs_confirmation patches on the same base as superseded."""
    stmt = (
        update(PatchTable)
        .where(
            PatchTable.design_id == design_id,
            PatchTable.base_version == base_version,
            PatchTable.id != accepted_patch_id,
            PatchTable.status.in_(["proposed", "needs_confirmation"]),
        )
        .values(status="superseded", decided_at=decided_at)
    )
    await db.execute(stmt)


async def insert_version_and_update_design(
    db: AsyncSession,
    design: DesignTable,
    new_version_record: DesignVersionTable,
) -> None:
    """Atomically insert version n+1 and update design.current_version."""
    db.add(new_version_record)
    design.current_version = new_version_record.version_no
    await db.flush()
