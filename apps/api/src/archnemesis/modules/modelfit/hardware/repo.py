"""Database repository for hardware profiles."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import HardwareProfileTable


class HardwareRepository:
    """Async database access for hardware profile records."""

    async def list_profiles(self, session: AsyncSession) -> Sequence[HardwareProfileTable]:
        """Returns all registered hardware profiles ordered by name."""
        stmt = select(HardwareProfileTable).order_by(HardwareProfileTable.name.asc())
        result = await session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(
        self, session: AsyncSession, profile_id: str
    ) -> HardwareProfileTable | None:
        """Finds a hardware profile by primary key UUID string."""
        stmt = select(HardwareProfileTable).where(HardwareProfileTable.id == profile_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_name(self, session: AsyncSession, name: str) -> HardwareProfileTable | None:
        """Finds a hardware profile by unique name."""
        stmt = select(HardwareProfileTable).where(HardwareProfileTable.name == name)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def seed_presets(self, session: AsyncSession, presets: list[dict[str, Any]]) -> int:
        """Idempotently seeds presets by unique name."""
        count = 0
        now_iso = datetime.now(UTC).isoformat()
        for data in presets:
            stmt = select(HardwareProfileTable).where(HardwareProfileTable.name == data["name"])
            res = await session.execute(stmt)
            existing = res.scalar_one_or_none()
            if existing:
                existing.memory_bytes = data["memory_bytes"]
                existing.kind = data.get("kind", "gpu")
                existing.reserved_memory_bytes = data.get("reserved_memory_bytes", 0)
                existing.source_url = data.get("source_url")
                existing.is_verified = data.get("is_verified", False)
                existing.notes = data.get("notes")
                existing.updated_at = now_iso
            else:
                profile = HardwareProfileTable(
                    id=uuid.uuid4().hex,
                    name=data["name"],
                    kind=data.get("kind", "gpu"),
                    memory_bytes=data["memory_bytes"],
                    reserved_memory_bytes=data.get("reserved_memory_bytes", 0),
                    source_url=data.get("source_url"),
                    is_verified=data.get("is_verified", False),
                    notes=data.get("notes"),
                    created_at=now_iso,
                    updated_at=now_iso,
                )
                session.add(profile)
            count += 1
        await session.commit()
        return count
