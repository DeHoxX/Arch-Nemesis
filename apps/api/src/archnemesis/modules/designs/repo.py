"""Database repository for designs and design versions."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import DesignTable, DesignVersionTable, SpecCacheTable


def _now() -> str:
    return datetime.now(UTC).isoformat()


async def get_design_by_session_id(db: AsyncSession, session_id: str) -> DesignTable | None:
    stmt = select(DesignTable).where(DesignTable.intake_session_id == session_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_design_by_id(db: AsyncSession, design_id: str) -> DesignTable | None:
    stmt = select(DesignTable).where(DesignTable.id == design_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_design_version(
    db: AsyncSession, design_id: str, version_no: int = 1
) -> DesignVersionTable | None:
    stmt = select(DesignVersionTable).where(
        DesignVersionTable.design_id == design_id,
        DesignVersionTable.version_no == version_no,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_design(
    db: AsyncSession,
    session_id: str,
    brief_dict: dict[str, Any],
    spec_dict: dict[str, Any],
    prompt_version: str,
    models_dict: dict[str, str],
    warnings: list[str] | None = None,
) -> tuple[DesignTable, DesignVersionTable]:
    design_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    now_str = _now()

    design = DesignTable(
        id=design_id,
        intake_session_id=session_id,
        current_version=1,
        created_at=now_str,
    )
    version = DesignVersionTable(
        id=version_id,
        design_id=design_id,
        version_no=1,
        brief_json=json.dumps(brief_dict),
        spec_json=json.dumps(spec_dict),
        explanation_json=None,
        prompt_version=prompt_version,
        models_json=json.dumps(models_dict),
        warnings_json=json.dumps(warnings or []),
        change_note=None,
        created_at=now_str,
    )

    db.add(design)
    db.add(version)
    await db.commit()
    await db.refresh(design)
    await db.refresh(version)
    return design, version


async def get_cached_spec(db: AsyncSession, key: str) -> SpecCacheTable | None:
    stmt = select(SpecCacheTable).where(SpecCacheTable.key == key)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def delete_cached_spec(db: AsyncSession, key: str) -> None:
    stmt = delete(SpecCacheTable).where(SpecCacheTable.key == key)
    await db.execute(stmt)
    await db.commit()


async def set_cached_spec(
    db: AsyncSession, key: str, spec_dict: dict[str, Any], created_at: str | None = None
) -> None:
    entry = SpecCacheTable(
        key=key,
        spec_json=json.dumps(spec_dict),
        created_at=created_at or _now(),
    )
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
