"""Tests for migration 0010 seeding 26 verified hardware profiles (D-428)."""

import importlib.util
import sqlite3
from pathlib import Path
from typing import Any

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext

from alembic import command
from archnemesis.settings import get_settings

GIB = 1024 * 1024 * 1024

EXPECTED_ORIGINAL_6 = {
    "NVIDIA GeForce RTX 3060 12GB": (12 * GIB, 512 * 1024 * 1024, "gpu", 1),
    "NVIDIA GeForce RTX 4090": (24 * GIB, 1024 * 1024 * 1024, "gpu", 1),
    "NVIDIA A100-PCIE-80GB": (80 * GIB, 0, "gpu", 1),
    "NVIDIA H100-SXM5-80GB": (80 * GIB, 0, "gpu", 1),
    "Apple Mac 16GB Unified": (16 * GIB, 3 * GIB, "apple_unified", 1),
    "Apple Mac 32GB Unified": (32 * GIB, 4 * GIB, "apple_unified", 1),
}

EXPECTED_NEW_CONSUMER_GB = {
    "NVIDIA GeForce RTX 3070": 8,
    "NVIDIA GeForce RTX 3080 10GB": 10,
    "NVIDIA GeForce RTX 3080 12GB": 12,
    "NVIDIA GeForce RTX 3090": 24,
    "NVIDIA GeForce RTX 4060": 8,
    "NVIDIA GeForce RTX 4060 Ti 8GB": 8,
    "NVIDIA GeForce RTX 4060 Ti 16GB": 16,
    "NVIDIA GeForce RTX 4070": 12,
    "NVIDIA GeForce RTX 4070 Ti Super": 16,
    "NVIDIA GeForce RTX 4080": 16,
    "NVIDIA GeForce RTX 5070": 12,
    "NVIDIA GeForce RTX 5080": 16,
    "NVIDIA GeForce RTX 5090": 32,
    "Intel Arc A770 16GB": 16,
}

EXPECTED_NEW_DATACENTER_GB = {
    "NVIDIA A10": 24,
    "NVIDIA L4": 24,
    "NVIDIA L40S": 48,
    "NVIDIA V100 16GB": 16,
    "NVIDIA V100 32GB": 32,
    "NVIDIA H200": 141,
    "AMD Instinct MI300X": 192,
}

EXPECTED_NEW_APPLE_GB = {
    "Apple Silicon 8GB Unified": 8,
    "Apple Silicon 24GB Unified": 24,
    "Apple Silicon 64GB Unified": 64,
    "Apple Silicon 96GB Unified": 96,
    "Apple Silicon 128GB Unified": 128,
}


def _load_migration_0010(api_dir: Path) -> Any:
    mig_path = api_dir / "alembic" / "versions" / "0010_more_hardware_profiles.py"
    spec = importlib.util.spec_from_file_location("mig_0010", mig_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_0010_more_hardware_profiles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify 0010 upgrade seeds 26 profiles idempotently, preserves 0008 rows, and downgrades."""
    db_file = tmp_path / "test_migration_0010.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()

    try:
        api_dir = Path(__file__).resolve().parent.parent
        alembic_cfg = Config(str(api_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
        command.upgrade(alembic_cfg, "0010_more_hardware_profiles")

        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, memory_bytes, reserved_memory_bytes, kind, is_verified, source_url, notes "
            "FROM hardware_profiles"
        )
        rows = cursor.fetchall()
        conn.close()

        assert len(rows) == 32, f"Expected 32 total rows (6 + 26), got {len(rows)}"
        by_name = {row[0]: row for row in rows}
        assert len(by_name) == 32, "Duplicate hardware profile names found"

        # Original 6 rows unchanged
        for orig_name, (exp_mem, exp_res, exp_kind, exp_ver) in EXPECTED_ORIGINAL_6.items():
            assert orig_name in by_name
            row = by_name[orig_name]
            assert row[1] == exp_mem
            assert row[2] == exp_res
            assert row[3] == exp_kind
            assert row[4] == exp_ver

        # 14 consumer + 7 datacenter + 5 apple_unified = 26 new rows
        assert len(EXPECTED_NEW_CONSUMER_GB) == 14
        assert len(EXPECTED_NEW_DATACENTER_GB) == 7
        assert len(EXPECTED_NEW_APPLE_GB) == 5

        for name, gb in EXPECTED_NEW_CONSUMER_GB.items():
            row = by_name[name]
            assert row[1] == gb * GIB
            assert row[2] == 1 * GIB
            assert row[3] == "gpu"
            assert row[4] == 0
            assert row[5]
            assert "source URL" in row[6] and "assumption" in row[6]

        for name, gb in EXPECTED_NEW_DATACENTER_GB.items():
            row = by_name[name]
            assert row[1] == gb * GIB
            assert row[2] == 0
            assert row[3] == "gpu"
            assert row[4] == 0
            assert row[5]
            assert "source URL" in row[6] and "assumption" in row[6]

        for name, gb in EXPECTED_NEW_APPLE_GB.items():
            row = by_name[name]
            assert row[1] == gb * GIB
            assert row[2] == (3 * GIB if gb == 8 else 4 * GIB)
            assert row[3] == "apple_unified"
            assert row[4] == 0
            assert row[5]
            assert "source URL" in row[6] and "assumption" in row[6]

        # Held-back GPUs must not exist
        assert "NVIDIA T4" not in by_name
        assert "AMD Radeon RX 7900 XTX" not in by_name

        # Running 0010 upgrade() a second time must be idempotent (no duplicates, still 32 rows)
        mig_0010 = _load_migration_0010(api_dir)
        sync_engine = sa.create_engine(f"sqlite:///{db_file.as_posix()}")
        try:
            with sync_engine.begin() as sa_conn:
                ctx = MigrationContext.configure(sa_conn)
                with Operations.context(ctx):
                    mig_0010.upgrade()
        finally:
            sync_engine.dispose()

        conn = sqlite3.connect(str(db_file))
        count_after_second = conn.execute("SELECT COUNT(*) FROM hardware_profiles").fetchone()[0]
        conn.close()
        assert count_after_second == 32

        # Downgrade to 0009 removes only the 26 new rows, leaving original 6 intact
        command.downgrade(alembic_cfg, "0009_model_shortlists")
        conn = sqlite3.connect(str(db_file))
        rows_after_down = conn.execute(
            "SELECT name, memory_bytes, reserved_memory_bytes, kind, is_verified "
            "FROM hardware_profiles"
        ).fetchall()
        conn.close()

        assert len(rows_after_down) == 6
        down_by_name = {row[0]: row for row in rows_after_down}
        for orig_name, (exp_mem, exp_res, exp_kind, exp_ver) in EXPECTED_ORIGINAL_6.items():
            assert orig_name in down_by_name
            assert down_by_name[orig_name][1:] == (exp_mem, exp_res, exp_kind, exp_ver)
    finally:
        get_settings.cache_clear()
