"""Create intake_sessions, designs, and design_versions tables.

Revision ID: 0002_intake_and_designs
Revises: 0001_baseline
Create Date: 2026-10-28 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_intake_and_designs"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "intake_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="collecting"),
        sa.Column("rounds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("turns_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("brief_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.Column("updated_at", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "designs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("intake_session_id", sa.String(length=36), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["intake_session_id"], ["intake_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("intake_session_id", name="uq_designs_intake_session_id"),
    )

    op.create_table(
        "design_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("design_id", sa.String(length=36), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("brief_json", sa.Text(), nullable=False),
        sa.Column("spec_json", sa.Text(), nullable=False),
        sa.Column("explanation_json", sa.Text(), nullable=True),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("models_json", sa.Text(), nullable=False),
        sa.Column("warnings_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["design_id"], ["designs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "design_id", "version_no", name="uq_design_versions_design_id_version_no"
        ),
    )


def downgrade() -> None:
    op.drop_table("design_versions")
    op.drop_table("designs")
    op.drop_table("intake_sessions")
