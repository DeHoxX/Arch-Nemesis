"""Tests for migration 0007 schema update creating model_suggestions table (Stage 6B, D-404)."""

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.settings import get_settings


def test_migration_0007_model_suggestions_table(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify that migration 0007 creates model_suggestions table and downgrades cleanly."""
    db_file = tmp_path / "test_migration_0007.db"
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

        # Check table creation
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='model_suggestions'"
        )
        assert cursor.fetchone() is not None, "Expected 'model_suggestions' table to exist"

        # Check column info
        cursor.execute("PRAGMA table_info(model_suggestions)")
        columns = {row[1]: (row[2], row[3], row[5]) for row in cursor.fetchall()}

        assert "id" in columns
        assert columns["id"][2] == 1  # Primary key

        assert "design_id" in columns
        assert columns["design_id"][0] == "VARCHAR(36)"
        assert columns["design_id"][1] == 1  # Not null

        assert "version_no" in columns
        assert columns["version_no"][0] == "INTEGER"

        assert "node_id" in columns
        assert columns["node_id"][0] == "VARCHAR(50)"

        assert "task_tag" in columns
        assert columns["task_tag"][0] == "VARCHAR(50)"

        assert "suggestions_json" in columns
        assert columns["suggestions_json"][0] == "TEXT"

        assert "created_at" in columns
        assert columns["created_at"][0] == "VARCHAR(30)"

        conn.close()

        # Check downgrade to 0006_design_title
        command.downgrade(alembic_cfg, "0006_design_title")
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='model_suggestions'"
        )
        assert cursor.fetchone() is None, (
            "Expected 'model_suggestions' table to be dropped on downgrade"
        )

        conn.close()
    finally:
        get_settings.cache_clear()
