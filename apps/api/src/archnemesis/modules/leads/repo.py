"""Database persistence operations for leads and design version lookups."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import DesignVersionTable, LeadTable


async def get_design_version(
    db: AsyncSession, design_id: str, version_no: int
) -> DesignVersionTable | None:
    """Retrieve a specific design version by design_id and version_no."""
    stmt = select(DesignVersionTable).where(
        DesignVersionTable.design_id == design_id,
        DesignVersionTable.version_no == version_no,
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def insert_lead(db: AsyncSession, lead: LeadTable) -> LeadTable:
    """Persist a new prospective client lead record."""
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


async def list_leads(db: AsyncSession, limit: int = 100) -> list[LeadTable]:
    """Retrieve recent leads ordered newest first, up to the specified limit."""
    stmt = select(LeadTable).order_by(LeadTable.created_at.desc(), LeadTable.id.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
