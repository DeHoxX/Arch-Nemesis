"""create spec_cache table

Revision ID: 0005_spec_cache
Revises: 0004_refinement
Create Date: 2026-11-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_spec_cache"
down_revision: str | None = "0004_refinement"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spec_cache",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("spec_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("spec_cache")
