"""Create model_suggestions table.

Revision ID: 0007_model_suggestions
Revises: 0006_design_title
Create Date: 2026-11-22 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_model_suggestions"
down_revision: str | None = "0006_design_title"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_suggestions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("design_id", sa.String(length=36), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(length=50), nullable=False),
        sa.Column("task_tag", sa.String(length=50), nullable=False),
        sa.Column("suggestions_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["design_id", "version_no"],
            ["design_versions.design_id", "design_versions.version_no"],
            name="fk_model_suggestions_design_versions",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("design_id", "version_no", "node_id", name="uq_model_suggestions_node"),
    )


def downgrade() -> None:
    op.drop_table("model_suggestions")
