"""Tests for migration 0004 schema creation for chat_messages and patches tables."""

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.settings import get_settings


def test_migration_0004_refinement_tables(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that alembic migration 0004 creates chat_messages and patches tables with correct schema."""
    db_file = tmp_path / "test_migration_0004.db"
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

        # Check table columns in chat_messages
        cursor.execute("PRAGMA table_info(chat_messages)")
        chat_columns = {row[1]: row[2] for row in cursor.fetchall()}
        expected_chat_columns = {
            "id": "VARCHAR(36)",
            "design_id": "VARCHAR(36)",
            "role": "VARCHAR(20)",
            "text": "TEXT",
            "created_at": "VARCHAR(30)",
        }
        for col_name in expected_chat_columns:
            assert col_name in chat_columns, f"Column {col_name} missing from chat_messages table"

        # Check foreign keys in chat_messages
        cursor.execute("PRAGMA foreign_key_list(chat_messages)")
        chat_fk_rows = cursor.fetchall()
        assert any(row[2] == "designs" for row in chat_fk_rows)

        # Check table columns in patches
        cursor.execute("PRAGMA table_info(patches)")
        patch_columns = {row[1]: row[2] for row in cursor.fetchall()}
        expected_patch_columns = {
            "id": "VARCHAR(36)",
            "design_id": "VARCHAR(36)",
            "kind": "VARCHAR(20)",
            "base_version": "INTEGER",
            "status": "VARCHAR(30)",
            "patch_json": "TEXT",
            "diff_json": "TEXT",
            "issues_json": "TEXT",
            "reason": "TEXT",
            "created_at": "VARCHAR(30)",
            "decided_at": "VARCHAR(30)",
        }
        for col_name in expected_patch_columns:
            assert col_name in patch_columns, f"Column {col_name} missing from patches table"

        # Check foreign keys in patches
        cursor.execute("PRAGMA foreign_key_list(patches)")
        patch_fk_rows = cursor.fetchall()
        assert any(row[2] == "designs" for row in patch_fk_rows)

        conn.close()

        # Check downgrade
        command.downgrade(alembic_cfg, "0003_leads")
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patches'")
        assert cursor.fetchone() is None
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'")
        assert cursor.fetchone() is None
        conn.close()
    finally:
        get_settings.cache_clear()
