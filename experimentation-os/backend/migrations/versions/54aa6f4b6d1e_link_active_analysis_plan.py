"""link the active analysis plan to each experiment

Revision ID: 54aa6f4b6d1e
Revises: 301e895fce3c
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "54aa6f4b6d1e"
down_revision: Union[str, None] = "301e895fce3c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.add_column(sa.Column("active_analysis_plan_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_experiments_active_analysis_plan",
            "analysis_plans",
            ["active_analysis_plan_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.drop_constraint("fk_experiments_active_analysis_plan", type_="foreignkey")
        batch_op.drop_column("active_analysis_plan_id")
