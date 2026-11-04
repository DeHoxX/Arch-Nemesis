"""Create chat_messages and patches tables for refinement.

Revision ID: 0004_refinement
Revises: 0003_leads
Create Date: 2026-11-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_refinement"
down_revision: str | None = "0003_leads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("design_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["design_id"],
            ["designs.id"],
            name="fk_chat_messages_design_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "patches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("design_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("patch_json", sa.Text(), nullable=False),
        sa.Column("diff_json", sa.Text(), nullable=True),
        sa.Column("issues_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.Column("decided_at", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(
            ["design_id"],
            ["designs.id"],
            name="fk_patches_design_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("patches")
    op.drop_table("chat_messages")
