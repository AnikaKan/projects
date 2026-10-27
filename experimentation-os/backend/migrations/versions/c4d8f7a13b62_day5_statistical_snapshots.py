"""add statistical snapshot provenance

Revision ID: c4d8f7a13b62
Revises: b7a4d2e91f63
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d8f7a13b62"
down_revision: Union[str, None] = "b7a4d2e91f63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("analysis_snapshots") as batch_op:
        batch_op.add_column(sa.Column("cohort_snapshot_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("analysis_version", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("image_version", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("library_versions", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("recommendation", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_analysis_snapshots_cohort_snapshot_id",
            "cohort_snapshots",
            ["cohort_snapshot_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_analysis_snapshots_cohort_snapshot_id", ["cohort_snapshot_id"])
        batch_op.create_unique_constraint(
            "uq_analysis_snapshots_cohort_version",
            ["cohort_snapshot_id", "analysis_version"],
        )


def downgrade() -> None:
    with op.batch_alter_table("analysis_snapshots") as batch_op:
        batch_op.drop_constraint("uq_analysis_snapshots_cohort_version", type_="unique")
        batch_op.drop_index("ix_analysis_snapshots_cohort_snapshot_id")
        batch_op.drop_constraint("fk_analysis_snapshots_cohort_snapshot_id", type_="foreignkey")
        batch_op.drop_column("finalized_at")
        batch_op.drop_column("recommendation")
        batch_op.drop_column("library_versions")
        batch_op.drop_column("image_version")
        batch_op.drop_column("analysis_version")
        batch_op.drop_column("cohort_snapshot_id")
