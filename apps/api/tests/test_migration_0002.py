"""Tests for migration 0002 schema defaults and rounds column alignment."""

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.db.tables import IntakeSessionTable
from archnemesis.settings import get_settings


def test_migration_0002_rounds_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that alembic migration 0002 applies server_default='0' for intake_sessions.rounds."""
    db_file = tmp_path / "test_migration.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()

    try:
        # Run alembic upgrade head against the temporary database
        api_dir = Path(__file__).resolve().parent.parent
        alembic_cfg = Config(str(api_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
        command.upgrade(alembic_cfg, "head")

        # Insert an intake_sessions row with raw SQL WITHOUT the rounds column
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO intake_sessions (id, status, turns_json, brief_json, created_at, updated_at)
            VALUES ('test-session-1', 'collecting', '[]', NULL, '2026-10-28T00:00:00', '2026-10-28T00:00:00')
            """
        )
        conn.commit()

        # Read it back and assert rounds == 0
        cursor.execute("SELECT rounds FROM intake_sessions WHERE id = 'test-session-1'")
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == 0
        conn.close()

        # Assert ORM column default is also 0
        assert IntakeSessionTable.rounds.property.columns[0].default.arg == 0
    finally:
        get_settings.cache_clear()
