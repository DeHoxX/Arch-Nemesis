"""Create model_cache and hardware_profiles tables and seed presets.

Revision ID: 0008_modelfit_tables
Revises: 0007_model_suggestions
Create Date: 2026-11-23 00:00:00.000000

"""

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.sql import table

from alembic import op

revision: str = "0008_modelfit_tables"
down_revision: str | None = "0007_model_suggestions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create model_cache table
    op.create_table(
        "model_cache",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("hf_model_id", sa.String(length=255), nullable=False),
        sa.Column("author", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("pipeline_tag", sa.String(length=50), nullable=True),
        sa.Column("likes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("downloads", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("etag", sa.String(length=255), nullable=True),
        sa.Column("last_modified", sa.String(length=100), nullable=True),
        sa.Column("fetched_at", sa.String(length=30), nullable=False),
        sa.Column("expires_at", sa.String(length=30), nullable=False),
        sa.Column("raw_config", sa.Text(), nullable=False),
        sa.Column("normalized_payload", sa.Text(), nullable=False),
        sa.Column("architecture_name", sa.String(length=100), nullable=True),
        sa.Column("is_supported", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "support_status", sa.String(length=50), nullable=False, server_default="supported_llm"
        ),
        sa.Column("support_reason_code", sa.String(length=50), nullable=True),
        sa.Column("support_reason_message", sa.Text(), nullable=True),
        sa.Column("gated", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("license", sa.String(length=100), nullable=True),
        sa.Column(
            "param_provenance", sa.String(length=50), nullable=False, server_default="derived"
        ),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.Column("updated_at", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hf_model_id", name="uq_model_cache_hf_model_id"),
    )
    op.create_index("ix_model_cache_author", "model_cache", ["author"], unique=False)
    op.create_index("ix_model_cache_model_name", "model_cache", ["model_name"], unique=False)
    op.create_index("ix_model_cache_expires_at", "model_cache", ["expires_at"], unique=False)

    # 2. Create hardware_profiles table
    op.create_table(
        "hardware_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False, server_default="gpu"),
        sa.Column("memory_bytes", sa.BigInteger(), nullable=False),
        sa.Column("reserved_memory_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.Column("updated_at", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_hardware_profiles_name"),
    )

    # 3. Seed hardware presets
    presets_path = (
        Path(__file__).parents[2]
        / "src"
        / "archnemesis"
        / "modules"
        / "modelfit"
        / "hardware"
        / "seeds"
        / "hardware_presets.json"
    )

    if presets_path.is_file():
        now_iso = datetime.now(UTC).isoformat()
        with open(presets_path, encoding="utf-8") as f:
            raw_presets = json.load(f)

        hardware_table = table(
            "hardware_profiles",
            sa.Column("id", sa.String(length=36)),
            sa.Column("name", sa.String(length=100)),
            sa.Column("kind", sa.String(length=30)),
            sa.Column("memory_bytes", sa.BigInteger()),
            sa.Column("reserved_memory_bytes", sa.BigInteger()),
            sa.Column("source_url", sa.String(length=500)),
            sa.Column("is_verified", sa.Boolean()),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.String(length=30)),
            sa.Column("updated_at", sa.String(length=30)),
        )

        rows = []
        for p in raw_presets:
            rows.append(
                {
                    "id": uuid.uuid4().hex,
                    "name": p["name"],
                    "kind": p.get("kind", "gpu"),
                    "memory_bytes": p["memory_bytes"],
                    "reserved_memory_bytes": p.get("reserved_memory_bytes", 0),
                    "source_url": p.get("source_url"),
                    "is_verified": p.get("is_verified", False),
                    "notes": p.get("notes"),
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            )

        if rows:
            op.bulk_insert(hardware_table, rows)


def downgrade() -> None:
    op.drop_table("hardware_profiles")
    op.drop_index("ix_model_cache_expires_at", table_name="model_cache")
    op.drop_index("ix_model_cache_model_name", table_name="model_cache")
    op.drop_index("ix_model_cache_author", table_name="model_cache")
    op.drop_table("model_cache")
