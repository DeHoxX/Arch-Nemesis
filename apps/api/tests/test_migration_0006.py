"""Tests for migration 0006 schema update adding title column to designs table."""

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.settings import get_settings


def test_migration_0006_design_title_column(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify that migration 0006 adds title column to designs table and downgrades cleanly."""
    db_file = tmp_path / "test_migration_0006.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()

    try:
        api_dir = Path(__file__).resolve().parent.parent
        alembic_cfg = Config(str(api_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
        command.upgrade(alembic_cfg, "head")

        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()

        # Check column info in designs table
        cursor.execute("PRAGMA table_info(designs)")
        columns = {row[1]: (row[2], row[3]) for row in cursor.fetchall()}
        assert "title" in columns, "Expected 'title' column in designs table"
        assert columns["title"][0] == "VARCHAR(100)"
        assert columns["title"][1] == 0, "Expected 'title' to be nullable (notnull == 0)"

        conn.close()

        # Check downgrade to 0005_spec_cache
        command.downgrade(alembic_cfg, "0005_spec_cache")
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(designs)")
        columns_after_downgrade = {row[1] for row in cursor.fetchall()}
        assert "title" not in columns_after_downgrade, (
            "Expected 'title' column to be dropped on downgrade"
        )

        # Verify spec_cache table still exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spec_cache'")
        assert cursor.fetchone() is not None, "Expected spec_cache table to remain"

        conn.close()
    finally:
        get_settings.cache_clear()
