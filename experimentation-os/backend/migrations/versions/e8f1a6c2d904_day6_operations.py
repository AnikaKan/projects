"""add operational evidence and decision uniqueness

Revision ID: e8f1a6c2d904
Revises: c4d8f7a13b62
Create Date: 2026-10-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8f1a6c2d904"
down_revision: Union[str, None] = "c4d8f7a13b62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("event_receipts") as batch_op:
        batch_op.add_column(sa.Column("queue_age_seconds", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("reconciliation_delay_seconds", sa.Float(), nullable=True))
    with op.batch_alter_table("decisions") as batch_op:
        batch_op.create_unique_constraint("uq_decisions_snapshot_id", ["snapshot_id"])
    op.create_table(
        "operational_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=40), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("recipient_label", sa.String(length=160), nullable=False),
        sa.Column("destination", sa.String(length=120), nullable=False),
        sa.Column("delivery_status", sa.String(length=40), nullable=False),
        sa.Column("is_test", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operational_alerts_environment_id", "operational_alerts", ["environment_id"]
    )
    op.create_index("ix_operational_alerts_project_id", "operational_alerts", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_operational_alerts_project_id", table_name="operational_alerts")
    op.drop_index("ix_operational_alerts_environment_id", table_name="operational_alerts")
    op.drop_table("operational_alerts")
    with op.batch_alter_table("decisions") as batch_op:
        batch_op.drop_constraint("uq_decisions_snapshot_id", type_="unique")
    with op.batch_alter_table("event_receipts") as batch_op:
        batch_op.drop_column("reconciliation_delay_seconds")
        batch_op.drop_column("queue_age_seconds")
