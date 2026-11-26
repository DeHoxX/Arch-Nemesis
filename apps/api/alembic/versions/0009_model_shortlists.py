"""Create model_shortlists table and truncate model_suggestions.

Revision ID: 0009_model_shortlists
Revises: 0008_modelfit_tables
Create Date: 2026-11-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_model_shortlists"
down_revision: str | None = "0008_modelfit_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create model_shortlists table
    op.create_table(
        "model_shortlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_tag", sa.String(length=50), nullable=False),
        sa.Column("repo_id", sa.String(length=255), nullable=False),
        sa.Column("author", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("total_params", sa.BigInteger(), nullable=False),
        sa.Column("size_band", sa.String(length=20), nullable=False),
        sa.Column("downloads", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("likes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rank_order", sa.Integer(), nullable=False),
        sa.Column("refreshed_at", sa.String(length=30), nullable=False),
        sa.Column("expires_at", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_tag", "repo_id", name="uq_model_shortlists_task_tag_repo_id"),
    )
    op.create_index("ix_model_shortlists_task_tag", "model_shortlists", ["task_tag"], unique=False)

    # 2. Invalidate and clear all previous cached model suggestions per plan (D-422)
    op.execute("DELETE FROM model_suggestions")


def downgrade() -> None:
    op.drop_index("ix_model_shortlists_task_tag", table_name="model_shortlists")
    op.drop_table("model_shortlists")
