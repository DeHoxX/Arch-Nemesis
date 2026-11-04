"""Tests for migration 0003 schema creation for the leads table."""

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.settings import get_settings


def test_migration_0003_leads_table(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that alembic migration 0003 creates the leads table with correct schema."""
    db_file = tmp_path / "test_migration_0003.db"
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

        # Check table columns in leads
        cursor.execute("PRAGMA table_info(leads)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        expected_columns = {
            "id": "VARCHAR(36)",
            "design_id": "VARCHAR(36)",
            "version_no": "INTEGER",
            "name": "VARCHAR(100)",
            "email": "VARCHAR(254)",
            "note": "TEXT",
            "consent_text_version": "VARCHAR(20)",
            "created_at": "VARCHAR(30)",
        }
        for col_name in expected_columns:
            assert col_name in columns, f"Column {col_name} missing from leads table"

        # Check foreign keys in leads
        cursor.execute("PRAGMA foreign_key_list(leads)")
        fk_rows = cursor.fetchall()
        # Should reference design_versions
        assert any(row[2] == "design_versions" for row in fk_rows)

        conn.close()

        # Check downgrade
        command.downgrade(alembic_cfg, "0002_intake_and_designs")
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'")
        assert cursor.fetchone() is None
        conn.close()
    finally:
        get_settings.cache_clear()
