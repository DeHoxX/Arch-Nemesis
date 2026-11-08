"""Operational logic to backfill concise AI titles for architecture designs.

Supports --dry-run (reporting counts only) and --apply (executing generation).
Never logs or prints brief text, generated titles, or secrets.
"""

import asyncio
import json
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import DesignTable, DesignVersionTable
from archnemesis.dependencies import get_llm_client
from archnemesis.llm.base import LLMClient
from archnemesis.modules.designs.repo import update_design_title
from archnemesis.modules.designs.title import generate_title_for_design
from archnemesis.settings import get_settings
from archnemesis.shared.brief import RequirementBrief


def parse_retry_delay(err_msg: str, default_seconds: float = 15.0) -> float:
    """Extract retry delay in seconds from error text with a +1s margin, defaulting to 15s."""
    m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+(?:\.\d+)?)", err_msg, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 1.0

    m = re.search(r"retry\s+(?:in|after)\s*[~:=]?\s*(\d+(?:\.\d+)?)", err_msg, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 1.0

    return default_seconds


async def run_backfill(
    db_factory: async_sessionmaker[AsyncSession] | None = None,
    llm: LLMClient | None = None,
    apply: bool = False,
    pause_seconds: float = 4.0,
    limit: int | None = None,
) -> dict[str, int]:
    """Execute dry-run inspection or apply title backfill on designs with title NULL."""
    engine = None
    if db_factory is None:
        settings = get_settings()
        engine, db_factory = create_engine_and_session(settings.database_url)

    if llm is None and apply:
        llm = get_llm_client()

    try:
        async with db_factory() as session:
            # 1. Gather baseline counts
            total_count_res = await session.execute(select(func.count(DesignTable.id)))
            total_designs = int(total_count_res.scalar() or 0)

            null_count_res = await session.execute(
                select(func.count(DesignTable.id)).where(DesignTable.title.is_(None))
            )
            null_designs = int(null_count_res.scalar() or 0)

        # Dry-run mode: report counts only
        if not apply:
            print("Backfill dry run:")
            print(f"Total designs: {total_designs}")
            print(f"Designs with NULL title: {null_designs}")
            print(f"Designs already titled: {total_designs - null_designs}")
            return {
                "total": total_designs,
                "null_count": null_designs,
                "already_titled": total_designs - null_designs,
            }

        # Apply mode: query records needing titles
        async with db_factory() as session:
            stmt = (
                select(DesignTable.id, DesignVersionTable.brief_json)
                .join(
                    DesignVersionTable,
                    (DesignVersionTable.design_id == DesignTable.id)
                    & (DesignVersionTable.version_no == 1),
                )
                .where(DesignTable.title.is_(None))
                .order_by(DesignTable.created_at.asc())
            )
            if limit:
                stmt = stmt.limit(limit)

            rows = list((await session.execute(stmt)).all())

        updated = 0
        skipped = 0
        failed = 0

        assert llm is not None, "LLM client required in apply mode"

        for idx, (design_id, brief_json) in enumerate(rows):
            try:
                brief_dict: dict[str, Any] = json.loads(brief_json) if brief_json else {}
                brief_obj = RequirementBrief.model_validate(brief_dict)
            except Exception:  # noqa: BLE001
                failed += 1
                continue

            title, _source, issue = await generate_title_for_design(design_id, brief_obj, llm)

            # Check if transient rate limit or service unavailable issue occurred
            if issue and ("RATE_LIMITED" in issue or "UNAVAILABLE" in issue):
                delay = parse_retry_delay(issue, default_seconds=15.0)
                await asyncio.sleep(delay)

                # Retry once
                title, _source, issue = await generate_title_for_design(design_id, brief_obj, llm)
                if issue and ("RATE_LIMITED" in issue or "UNAVAILABLE" in issue):
                    skipped += 1
                    continue

            # Persist title to database
            try:
                async with db_factory() as session:
                    await update_design_title(session, design_id, title)
                updated += 1
            except Exception:  # noqa: BLE001
                failed += 1

            # Throttle between calls if more rows remain
            if pause_seconds > 0 and idx < len(rows) - 1:
                await asyncio.sleep(pause_seconds)

        print("Backfill completed:")
        print(f"Updated: {updated}")
        print(f"Skipped: {skipped}")
        print(f"Failed: {failed}")
        return {"updated": updated, "skipped": skipped, "failed": failed}

    finally:
        if engine is not None:
            await engine.dispose()
