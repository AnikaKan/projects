from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def enum_values(enum: type[StrEnum]) -> list[str]:
    return [item.value for item in enum]


class OperatorRole(StrEnum):
    VIEWER = "viewer"
    EDITOR = "editor"
    APPROVER = "approver"
    ADMINISTRATOR = "administrator"


class ExperimentStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    RUNNING = "running"
    ENROLLMENT_CLOSED = "enrollment_closed"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    STOPPED = "stopped"


class ReceiptStatus(StrEnum):
    RECEIVED = "received"
    STORED = "stored"
    QUARANTINED = "quarantined"
    REPLAYED = "replayed"


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Organization(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)


class OperatorMembership(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "operator_memberships"
    __table_args__ = (UniqueConstraint("issuer", "subject"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issuer: Mapped[str] = mapped_column(String(500), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[OperatorRole] = mapped_column(
        SqlEnum(OperatorRole, values_callable=enum_values, name="operator_role"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Project(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("organization_id", "key"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)


class Environment(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "environments"
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)


class ServiceCredential(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "service_credentials"
    __table_args__ = (UniqueConstraint("environment_id", "name"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    secret_digest: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    created_by_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_from_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_credentials.id", ondelete="SET NULL")
    )


class Experiment(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "experiments"
    __table_args__ = (
        UniqueConstraint("environment_id", "key"),
        Index(
            "uq_experiments_one_active_per_environment",
            "environment_id",
            unique=True,
            postgresql_where=text("status IN ('running', 'enrollment_closed', 'finalizing')"),
            sqlite_where=text("status IN ('running', 'enrollment_closed', 'finalizing')"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ExperimentStatus] = mapped_column(
        SqlEnum(ExperimentStatus, values_callable=enum_values, name="experiment_status"),
        nullable=False,
        default=ExperimentStatus.DRAFT,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active_configuration_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "configuration_versions.id",
            name="fk_experiments_active_config_version",
            ondelete="RESTRICT",
            use_alter=True,
        )
    )
    active_analysis_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "analysis_plans.id",
            name="fk_experiments_active_analysis_plan",
            ondelete="RESTRICT",
            use_alter=True,
        )
    )
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enrollment_closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConfigurationVersion(UUIDPrimaryKey, Base):
    __tablename__ = "configuration_versions"
    __table_args__ = (UniqueConstraint("experiment_id", "version"),)

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    digest: Mapped[str] = mapped_column(String(64), nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_subject: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AnalysisPlan(UUIDPrimaryKey, Base):
    __tablename__ = "analysis_plans"
    __table_args__ = (UniqueConstraint("experiment_id", "version"),)

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    digest: Mapped[str] = mapped_column(String(64), nullable=False)
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Assignment(UUIDPrimaryKey, Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("environment_id", "experiment_id", "subject_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    configuration_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("configuration_versions.id", ondelete="RESTRICT"), nullable=False
    )
    subject_id: Mapped[str] = mapped_column(String(255), nullable=False)
    arm: Mapped[str] = mapped_column(String(80), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(40), nullable=False)


class RawEvent(UUIDPrimaryKey, Base):
    __tablename__ = "raw_events"
    __table_args__ = (UniqueConstraint("environment_id", "event_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_id: Mapped[str] = mapped_column(String(160), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    source_identity: Mapped[str] = mapped_column(String(255), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(160), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)


class EventReceipt(UUIDPrimaryKey, Timestamped, Base):
    __tablename__ = "event_receipts"
    __table_args__ = (UniqueConstraint("environment_id", "delivery_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    delivery_id: Mapped[str] = mapped_column(String(160), nullable=False)
    event_id: Mapped[str] = mapped_column(String(160), nullable=False)
    queue_message_id: Mapped[str | None] = mapped_column(String(160))
    receive_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[ReceiptStatus] = mapped_column(
        SqlEnum(ReceiptStatus, values_callable=enum_values, name="receipt_status"), nullable=False
    )
    failure_reason: Mapped[str | None] = mapped_column(Text)
    replayed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    queue_age_seconds: Mapped[float | None] = mapped_column()
    reconciliation_delay_seconds: Mapped[float | None] = mapped_column()


class QuarantinedEvent(UUIDPrimaryKey, Base):
    __tablename__ = "quarantined_events"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_id: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    delivery_id: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    reason: Mapped[str] = mapped_column(String(160), nullable=False)
    quarantined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EventContribution(UUIDPrimaryKey, Base):
    __tablename__ = "event_contributions"
    __table_args__ = (UniqueConstraint("raw_event_id", "derivation_version"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    raw_event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("raw_events.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    derived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class UserFact(UUIDPrimaryKey, Base):
    __tablename__ = "user_facts"
    __table_args__ = (
        UniqueConstraint(
            "assignment_id",
            "metric_key",
            "window_start",
            "window_end",
            "derivation_version",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    arm: Mapped[str] = mapped_column(String(80), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("raw_events.id", ondelete="RESTRICT"), index=True
    )
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    derived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EventExclusion(UUIDPrimaryKey, Base):
    __tablename__ = "event_exclusions"
    __table_args__ = (UniqueConstraint("raw_event_id", "derivation_version"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    raw_event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("raw_events.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    excluded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PipelineCheckpoint(UUIDPrimaryKey, Base):
    __tablename__ = "pipeline_checkpoints"
    __table_args__ = (UniqueConstraint("experiment_id", "source_name", "partition_key"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_name: Mapped[str] = mapped_column(String(80), nullable=False)
    partition_key: Mapped[str] = mapped_column(String(120), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    observed_event_count: Mapped[int] = mapped_column(Integer, nullable=False)
    missing_reason: Mapped[str | None] = mapped_column(String(240))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CohortSnapshot(UUIDPrimaryKey, Base):
    __tablename__ = "cohort_snapshots"
    __table_args__ = (UniqueConstraint("experiment_id", "derivation_version"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    configuration_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("configuration_versions.id", ondelete="RESTRICT"), nullable=False
    )
    analysis_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analysis_plans.id", ondelete="RESTRICT"), nullable=False
    )
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    event_derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_cutoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_counts: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    arm_counts: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    checks: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    readiness: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    finalization_ready: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AnalysisSnapshot(UUIDPrimaryKey, Base):
    __tablename__ = "analysis_snapshots"
    __table_args__ = (UniqueConstraint("cohort_snapshot_id", "analysis_version"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    configuration_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("configuration_versions.id", ondelete="RESTRICT"), nullable=False
    )
    analysis_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analysis_plans.id", ondelete="RESTRICT"), nullable=False
    )
    cohort_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cohort_snapshots.id", ondelete="RESTRICT"), index=True
    )
    analysis_version: Mapped[str | None] = mapped_column(String(40))
    derivation_version: Mapped[str] = mapped_column(String(40), nullable=False)
    code_version: Mapped[str] = mapped_column(String(80), nullable=False)
    image_version: Mapped[str | None] = mapped_column(String(160))
    library_versions: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    cutoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_counts: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    checks: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    results: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    recommendation: Mapped[str | None] = mapped_column(String(80))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Decision(UUIDPrimaryKey, Base):
    __tablename__ = "decisions"
    __table_args__ = (UniqueConstraint("snapshot_id"),)

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analysis_snapshots.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    actor_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    rollout_reference: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OperationalAlert(UUIDPrimaryKey, Base):
    __tablename__ = "operational_alerts"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    recipient_label: Mapped[str] = mapped_column(String(160), nullable=False)
    destination: Mapped[str] = mapped_column(String(120), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(40), nullable=False)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditRecord(UUIDPrimaryKey, Base):
    __tablename__ = "audit_records"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    environment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("environments.id", ondelete="RESTRICT"), index=True
    )
    actor_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(160), nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
