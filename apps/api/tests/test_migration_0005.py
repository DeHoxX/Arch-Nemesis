"""Tests for migration 0005 schema creation for spec_cache table."""

import logging
import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from archnemesis.settings import get_settings


def test_migration_0005_spec_cache_table(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that alembic migration 0005 creates spec_cache table with correct schema and downgrades cleanly."""
    db_file = tmp_path / "test_migration_0005.db"
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

        # Check table columns in spec_cache
        cursor.execute("PRAGMA table_info(spec_cache)")
        spec_cache_columns = {row[1]: (row[2], row[5]) for row in cursor.fetchall()}
        expected_columns = {
            "key": "VARCHAR(64)",
            "spec_json": "TEXT",
            "created_at": "VARCHAR(30)",
        }
        for col_name, expected_type in expected_columns.items():
            assert col_name in spec_cache_columns, (
                f"Column {col_name} missing from spec_cache table"
            )
            assert spec_cache_columns[col_name][0] == expected_type

        # Verify key is primary key (pk flag == 1)
        assert spec_cache_columns["key"][1] == 1, "Expected 'key' column to be primary key"

        conn.close()

        # Check downgrade to 0004_refinement
        command.downgrade(alembic_cfg, "0004_refinement")
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spec_cache'")
        assert cursor.fetchone() is None, "Expected spec_cache table to be dropped on downgrade"

        # Verify refinement tables remain intact
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'")
        assert cursor.fetchone() is not None, "Expected chat_messages table to remain"
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patches'")
        assert cursor.fetchone() is not None, "Expected patches table to remain"

        conn.close()
    finally:
        get_settings.cache_clear()


def test_migration_does_not_disable_existing_loggers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Verify that running an alembic migration does not disable existing loggers or drop log records."""
    db_file = tmp_path / "test_migration_log.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()

    # Pre-existing logger simulating a prior test importing service
    svc_logger = logging.getLogger("archnemesis.modules.designs.service")
    assert svc_logger.disabled is False

    try:
        api_dir = Path(__file__).resolve().parent.parent
        alembic_cfg = Config(str(api_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
        command.upgrade(alembic_cfg, "head")

        # Assert logger remains active and not disabled after migration execution
        assert svc_logger.disabled is False

        # Assert root handlers and caplog still capture an INFO record from the service logger
        caplog.clear()
        caplog.set_level(logging.INFO)
        svc_logger.info("post_migration_log_record")
        assert len(caplog.records) > 0, "Expected non-empty caplog records after migration"
        assert any("post_migration_log_record" in r.getMessage() for r in caplog.records)
    finally:
        get_settings.cache_clear()
