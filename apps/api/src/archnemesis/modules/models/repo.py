"""Database repository for model suggestions (Stage 6B, D-404)."""

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import (
    DesignTable,
    DesignVersionTable,
    ModelShortlistTable,
    ModelSuggestionTable,
)
from archnemesis.modules.models.schemas import ModelSuggestionItem


async def get_design(db: AsyncSession, design_id: str) -> DesignTable | None:
    """Retrieve design record by ID."""
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


async def get_model_suggestions(
    db: AsyncSession, design_id: str, version_no: int, node_id: str
) -> ModelSuggestionTable | None:
    """Retrieve cached model suggestions for a specific node in a design version."""
    stmt = select(ModelSuggestionTable).where(
        ModelSuggestionTable.design_id == design_id,
        ModelSuggestionTable.version_no == version_no,
        ModelSuggestionTable.node_id == node_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def save_model_suggestions(
    db: AsyncSession,
    design_id: str,
    version_no: int,
    node_id: str,
    task_tag: str,
    items: list[ModelSuggestionItem],
) -> ModelSuggestionTable:
    """Persist successful model suggestions.

    Stores strictly normalized IDs and metadata without URLs. Only status 'ok'
    recommendations are persisted; failed or unavailable states are never stored.
    """
    serialized_items = [item.model_dump() for item in items]
    record = ModelSuggestionTable(
        id=str(uuid4()),
        design_id=design_id,
        version_no=version_no,
        node_id=node_id,
        task_tag=task_tag,
        suggestions_json=json.dumps(serialized_items),
        created_at=datetime.now(UTC).isoformat(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_model_shortlist(
    db: AsyncSession,
    task_tag: str,
) -> list[ModelShortlistTable]:
    """Retrieve all shortlist models for a given task tag ordered by rank_order asc."""
    stmt = (
        select(ModelShortlistTable)
        .where(ModelShortlistTable.task_tag == task_tag)
        .order_by(ModelShortlistTable.rank_order.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def save_model_shortlist(
    db: AsyncSession,
    task_tag: str,
    items: list[ModelShortlistTable],
) -> None:
    """Atomically replace all shortlist models for a given task tag."""
    seen_repo_ids: set[str] = set()
    deduped_items: list[ModelShortlistTable] = []
    for item in items:
        if item.repo_id in seen_repo_ids:
            continue
        seen_repo_ids.add(item.repo_id)
        item.rank_order = len(deduped_items) + 1
        deduped_items.append(item)

    try:
        await db.execute(
            delete(ModelShortlistTable).where(ModelShortlistTable.task_tag == task_tag)
        )
        db.add_all(deduped_items)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
