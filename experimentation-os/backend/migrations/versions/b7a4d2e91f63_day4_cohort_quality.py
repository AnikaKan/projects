"""add versioned cohorts and pipeline quality records

Revision ID: b7a4d2e91f63
Revises: 8c1f5e9a2d40
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7a4d2e91f63"
down_revision: Union[str, None] = "8c1f5e9a2d40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.add_column(sa.Column("launched_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("enrollment_closed_at", sa.DateTime(timezone=True), nullable=True)
        )
    op.execute(
        """
        UPDATE experiments
        SET launched_at = created_at
        WHERE status IN ('running', 'enrollment_closed', 'finalizing', 'completed', 'stopped')
          AND launched_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE experiments
        SET enrollment_closed_at = updated_at
        WHERE status IN ('enrollment_closed', 'finalizing', 'completed')
          AND enrollment_closed_at IS NULL
        """
    )

    with op.batch_alter_table("user_facts") as batch_op:
        batch_op.drop_constraint("uq_user_facts_assignment_id", type_="unique")
        batch_op.add_column(sa.Column("experiment_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("arm", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("source_event_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_user_facts_experiment_id_experiments",
            "experiments",
            ["experiment_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_foreign_key(
            "fk_user_facts_source_event_id_raw_events",
            "raw_events",
            ["source_event_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_user_facts_experiment_id", ["experiment_id"])
        batch_op.create_index("ix_user_facts_source_event_id", ["source_event_id"])
    op.execute(
        """
        UPDATE user_facts
        SET experiment_id = (
                SELECT assignments.experiment_id
                FROM assignments
                WHERE assignments.id = user_facts.assignment_id
            ),
            arm = (
                SELECT assignments.arm
                FROM assignments
                WHERE assignments.id = user_facts.assignment_id
            )
        """
    )
    with op.batch_alter_table("user_facts") as batch_op:
        batch_op.alter_column("experiment_id", nullable=False)
        batch_op.alter_column("arm", nullable=False)
        batch_op.create_unique_constraint(
            "uq_user_facts_assignment_metric_window_version",
            [
                "assignment_id",
                "metric_key",
                "window_start",
                "window_end",
                "derivation_version",
            ],
        )

    op.create_table(
        "event_exclusions",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("raw_event_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("reason", sa.String(length=120), nullable=False),
        sa.Column("derivation_version", sa.String(length=40), nullable=False),
        sa.Column(
            "excluded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
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
        op.create_index(f"ix_event_exclusions_{column}", "event_exclusions", [column])

    op.create_table(
        "pipeline_checkpoints",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("source_name", sa.String(length=80), nullable=False),
        sa.Column("partition_key", sa.String(length=120), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("complete", sa.Boolean(), nullable=False),
        sa.Column("observed_event_count", sa.Integer(), nullable=False),
        sa.Column("missing_reason", sa.String(length=240), nullable=True),
        sa.Column(
            "recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_id", "source_name", "partition_key"),
    )
    for column in ("project_id", "environment_id", "experiment_id"):
        op.create_index(f"ix_pipeline_checkpoints_{column}", "pipeline_checkpoints", [column])

    op.create_table(
        "cohort_snapshots",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("configuration_version_id", sa.Uuid(), nullable=False),
        sa.Column("analysis_plan_id", sa.Uuid(), nullable=False),
        sa.Column("derivation_version", sa.String(length=40), nullable=False),
        sa.Column("event_derivation_version", sa.String(length=40), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arrival_cutoff_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_counts", sa.JSON(), nullable=False),
        sa.Column("arm_counts", sa.JSON(), nullable=False),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("readiness", sa.JSON(), nullable=False),
        sa.Column("finalization_ready", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["analysis_plan_id"], ["analysis_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["configuration_version_id"], ["configuration_versions.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_id", "derivation_version"),
    )
    for column in ("project_id", "environment_id", "experiment_id"):
        op.create_index(f"ix_cohort_snapshots_{column}", "cohort_snapshots", [column])


def downgrade() -> None:
    op.drop_table("cohort_snapshots")
    op.drop_table("pipeline_checkpoints")
    op.drop_table("event_exclusions")
    with op.batch_alter_table("user_facts") as batch_op:
        batch_op.drop_constraint("uq_user_facts_assignment_metric_window_version", type_="unique")
        batch_op.drop_index("ix_user_facts_source_event_id")
        batch_op.drop_index("ix_user_facts_experiment_id")
        batch_op.drop_constraint("fk_user_facts_source_event_id_raw_events", type_="foreignkey")
        batch_op.drop_constraint("fk_user_facts_experiment_id_experiments", type_="foreignkey")
        batch_op.drop_column("source_event_id")
        batch_op.drop_column("arm")
        batch_op.drop_column("experiment_id")
        batch_op.create_unique_constraint(
            "uq_user_facts_assignment_id",
            ["assignment_id", "metric_key", "window_start", "window_end"],
        )
    with op.batch_alter_table("experiments") as batch_op:
        batch_op.drop_column("enrollment_closed_at")
        batch_op.drop_column("launched_at")
