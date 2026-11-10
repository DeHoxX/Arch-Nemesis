"""Operational logic to backfill concise deterministic titles for architecture designs.

Supports --dry-run (inspecting candidates and proposed titles) and --apply (updating database).
Never calls Gemini; uses pure deterministic fallback_title from brief fields.
Never logs or prints brief summary or brief text.
"""

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import DesignTable, DesignVersionTable
from archnemesis.modules.designs.repo import update_design_title
from archnemesis.modules.designs.title import fallback_title
from archnemesis.settings import get_settings


def validate_backup_path(
    backup_path: Path | str | None,
    live_db_path: Path | str | None,
) -> Path:
    """Validate that backup_path exists, is a non-empty file, and differs from live_db_path."""
    if not backup_path:
        raise ValueError("Missing required --backup-path in apply mode.")

    b_path = Path(backup_path).resolve()
    if not b_path.exists():
        raise ValueError(f"Backup file does not exist: {b_path}")

    if not b_path.is_file() or b_path.stat().st_size == 0:
        raise ValueError(f"Backup file is empty or not a regular file: {b_path}")

    if live_db_path:
        l_path = Path(live_db_path).resolve()
        if b_path == l_path:
            raise ValueError(f"Backup file cannot be the same path as live database: {b_path}")

    return b_path


async def run_backfill(
    db_factory: async_sessionmaker[AsyncSession] | None = None,
    live_db_path: Path | str | None = None,
    backup_path: Path | str | None = None,
    apply: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    """Execute dry-run inspection or apply deterministic title backfill on designs with title NULL."""
    engine = None
    if db_factory is None:
        settings = get_settings()
        engine, db_factory = create_engine_and_session(settings.database_url)
        if live_db_path is None and "sqlite" in settings.database_url:
            db_path_str = settings.database_url.split(":///")[-1]
            live_db_path = Path(db_path_str).resolve()

    # Guard apply mode with mandatory valid database backup copy
    if apply:
        validate_backup_path(backup_path, live_db_path)

    try:
        async with db_factory() as session:
            # 1. Gather baseline counts
            total_count_res = await session.execute(select(func.count(DesignTable.id)))
            total_designs = int(total_count_res.scalar() or 0)

            null_count_res = await session.execute(
                select(func.count(DesignTable.id)).where(DesignTable.title.is_(None))
            )
            null_designs = int(null_count_res.scalar() or 0)

        # Dry-run mode: print candidates (design_id, current_title, proposed_title) and counts
        if not apply:
            async with db_factory() as session:
                dry_stmt = (
                    select(
                        DesignTable.id,
                        DesignTable.title,
                        DesignVersionTable.brief_json,
                    )
                    .join(
                        DesignVersionTable,
                        (DesignVersionTable.design_id == DesignTable.id)
                        & (DesignVersionTable.version_no == 1),
                    )
                    .where(DesignTable.title.is_(None))
                    .order_by(DesignTable.created_at.asc())
                )
                if limit:
                    dry_stmt = dry_stmt.limit(limit)

                candidate_rows = list((await session.execute(dry_stmt)).all())

            for design_id, current_title, brief_json in candidate_rows:
                summary = ""
                domain_hint = None
                if brief_json:
                    try:
                        brief_dict = json.loads(brief_json)
                        summary = brief_dict.get("summary", "")
                        domain_hint = brief_dict.get("domain_hint")
                    except Exception:  # noqa: BLE001, S110
                        pass

                proposed = fallback_title(summary, domain_hint)
                current_display = current_title if current_title is not None else "<NULL>"
                print(f"Candidate: {design_id} | current: {current_display} | proposed: {proposed}")

            print("Backfill dry run:")
            print(f"Total designs: {total_designs}")
            print(f"Designs with NULL title: {null_designs}")
            print(f"Designs already titled: {total_designs - null_designs}")
            return {
                "total": total_designs,
                "null_count": null_designs,
                "already_titled": total_designs - null_designs,
            }

        # Apply mode: query and update records with title NULL
        async with db_factory() as session:
            apply_stmt = (
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
                apply_stmt = apply_stmt.limit(limit)

            rows = list((await session.execute(apply_stmt)).all())

        updated = 0
        failed = 0

        for design_id, brief_json in rows:
            try:
                summary = ""
                domain_hint = None
                if brief_json:
                    brief_dict = json.loads(brief_json)
                    summary = brief_dict.get("summary", "")
                    domain_hint = brief_dict.get("domain_hint")

                title = fallback_title(summary, domain_hint)
            except Exception:  # noqa: BLE001
                failed += 1
                continue

            try:
                async with db_factory() as session:
                    await update_design_title(session, design_id, title)
                updated += 1
            except Exception:  # noqa: BLE001
                failed += 1

        print("Backfill completed:")
        print(f"Updated: {updated}")
        print(f"Failed: {failed}")
        return {"updated": updated, "failed": failed}

    finally:
        if engine is not None:
            await engine.dispose()
