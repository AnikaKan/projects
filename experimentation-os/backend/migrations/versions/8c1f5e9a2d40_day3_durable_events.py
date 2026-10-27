"""add durable event ingestion records

Revision ID: 8c1f5e9a2d40
Revises: 54aa6f4b6d1e
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8c1f5e9a2d40"
down_revision: Union[str, None] = "54aa6f4b6d1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("raw_events") as batch_op:
        batch_op.add_column(sa.Column("experiment_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("source_identity", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("correlation_id", sa.String(length=160), nullable=True))
        batch_op.create_foreign_key(
            "fk_raw_events_experiment_id_experiments",
            "experiments",
            ["experiment_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_raw_events_experiment_id", ["experiment_id"])

    op.execute(
        """
        UPDATE raw_events
        SET experiment_id = (
                SELECT assignments.experiment_id
                FROM assignments
                WHERE assignments.id = raw_events.assignment_id
            ),
            source_identity = (
                SELECT assignments.subject_id
                FROM assignments
                WHERE assignments.id = raw_events.assignment_id
            ),
            correlation_id = event_id
        """
    )
    with op.batch_alter_table("raw_events") as batch_op:
        batch_op.alter_column("experiment_id", nullable=False)
        batch_op.alter_column("source_identity", nullable=False)
        batch_op.alter_column("correlation_id", nullable=False)

    with op.batch_alter_table("event_receipts") as batch_op:
        batch_op.add_column(sa.Column("queue_message_id", sa.String(length=160), nullable=True))
        batch_op.add_column(
            sa.Column("receive_count", sa.Integer(), nullable=False, server_default="1")
        )

    op.create_table(
        "quarantined_events",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.String(length=160), nullable=False),
        sa.Column("delivery_id", sa.String(length=160), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(length=160), nullable=False),
        sa.Column(
            "quarantined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("delivery_id"),
    )
    op.create_index("ix_quarantined_events_project_id", "quarantined_events", ["project_id"])
    op.create_index(
        "ix_quarantined_events_environment_id", "quarantined_events", ["environment_id"]
    )
    op.create_index("ix_quarantined_events_event_id", "quarantined_events", ["event_id"])

    op.create_table(
        "event_contributions",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("raw_event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("derivation_version", sa.String(length=40), nullable=False),
        sa.Column(
            "derived_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["raw_event_id"], ["raw_events.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("raw_event_id", "derivation_version"),
    )
    for column in (
        "project_id",
        "environment_id",
        "experiment_id",
        "assignment_id",
        "raw_event_id",
    ):
        op.create_index(f"ix_event_contributions_{column}", "event_contributions", [column])


def downgrade() -> None:
    op.drop_table("event_contributions")
    op.drop_table("quarantined_events")
    with op.batch_alter_table("event_receipts") as batch_op:
        batch_op.drop_column("receive_count")
        batch_op.drop_column("queue_message_id")
    with op.batch_alter_table("raw_events") as batch_op:
        batch_op.drop_index("ix_raw_events_experiment_id")
        batch_op.drop_constraint("fk_raw_events_experiment_id_experiments", type_="foreignkey")
        batch_op.drop_column("correlation_id")
        batch_op.drop_column("source_identity")
        batch_op.drop_column("experiment_id")
