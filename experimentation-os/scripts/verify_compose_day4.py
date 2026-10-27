"""Verify Day 4 against the composed PostgreSQL API using synthetic local data."""

from __future__ import annotations

import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import delete
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import AuthMode, RuntimeEnvironment, Settings  # noqa: E402
from app.db.models import (  # noqa: E402
    AnalysisPlan,
    Assignment,
    AuditRecord,
    CohortSnapshot,
    ConfigurationVersion,
    Environment,
    EventContribution,
    EventExclusion,
    Experiment,
    ExperimentStatus,
    Organization,
    PipelineCheckpoint,
    Project,
    RawEvent,
    UserFact,
)
from app.db.session import create_database_engine  # noqa: E402
from app.domain.cohorts import (  # noqa: E402
    derive_cohort_snapshot,
    record_pipeline_checkpoint,
)
from app.domain.events import replay_raw_events  # noqa: E402

API_URL = os.environ.get("EXPERIMENTOS_API_URL", "http://localhost:8000")
DATABASE_URL = os.environ.get(
    "EXPERIMENTOS_COMPOSE_DATABASE_URL",
    "postgresql://experimentos:experimentos@localhost:5432/experimentos",
)
SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)


def headers(organization_id: uuid.UUID, role: str = "viewer") -> dict[str, str]:
    return {
        "X-Local-Subject": "day4-compose-verifier@example.test",
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def add_event(
    session: Session,
    *,
    experiment: Experiment,
    assignment: Assignment,
    event_type: str,
    event_id: str,
    occurred_at: datetime,
) -> RawEvent:
    raw = RawEvent(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        assignment_id=assignment.id,
        event_id=event_id,
        schema_version="1",
        event_type=event_type,
        source_identity=assignment.subject_id,
        correlation_id=f"day4-{event_id}",
        payload_hash="d" * 64,
        payload={},
        occurred_at=occurred_at,
        ingested_at=occurred_at + timedelta(seconds=2),
        derivation_version="events-v1",
    )
    session.add(raw)
    session.flush()
    session.add(
        EventContribution(
            project_id=experiment.project_id,
            environment_id=experiment.environment_id,
            experiment_id=experiment.id,
            assignment_id=assignment.id,
            raw_event_id=raw.id,
            event_type=event_type,
            occurred_at=occurred_at,
            derivation_version="events-v1",
        )
    )
    session.flush()
    return raw


def main() -> None:
    settings = Settings(
        EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.LOCAL,
        AUTH_MODE=AuthMode.LOCAL,
        DATABASE_URL=SQLALCHEMY_DATABASE_URL,
        CREDENTIAL_PEPPER="local-compose-pepper-not-for-managed-use-0001",
    )
    engine = create_database_engine(settings.database_url)
    organization_id, project_id, environment_id, sibling_environment_id = [
        uuid.uuid4() for _ in range(4)
    ]
    experiment_id = uuid.uuid4()
    anchor = datetime.now(UTC) - timedelta(days=4)
    try:
        with Session(engine) as session:
            organization = Organization(
                id=organization_id, name=f"Day 4 verification {organization_id.hex[:8]}"
            )
            project = Project(
                id=project_id,
                organization_id=organization_id,
                key=f"day4-{organization_id.hex[:8]}",
                name="Day 4 verification",
            )
            environment = Environment(
                id=environment_id, project_id=project_id, key="local", name="Local"
            )
            sibling = Environment(
                id=sibling_environment_id,
                project_id=project_id,
                key="sibling",
                name="Sibling",
            )
            experiment = Experiment(
                id=experiment_id,
                project_id=project_id,
                environment_id=environment_id,
                key="quality-verification",
                name="Quality verification",
                owner_subject="day4-compose-verifier@example.test",
                status=ExperimentStatus.ENROLLMENT_CLOSED,
                version=4,
                launched_at=anchor,
                enrollment_closed_at=anchor + timedelta(hours=1),
            )
            session.add(organization)
            session.flush()
            session.add(project)
            session.flush()
            session.add_all([environment, sibling])
            session.flush()
            session.add(experiment)
            session.flush()
            configuration = ConfigurationVersion(
                experiment_id=experiment.id,
                version=1,
                document={
                    "identity_namespace": "day4-verifier",
                    "traffic_allocation_basis_points": 10_000,
                    "salt": "day4-verifier-salt-long-enough",
                    "algorithm_version": "sha256-v1",
                    "arms": [
                        {"key": "control", "allocation_basis_points": 5000},
                        {"key": "treatment", "allocation_basis_points": 5000},
                    ],
                    "eligibility": None,
                    "safe_fallback": "unavailable",
                },
                digest="a" * 64,
                approved_at=anchor,
                approved_by_subject="day4-compose-verifier@example.test",
            )
            plan = AnalysisPlan(
                experiment_id=experiment.id,
                version=1,
                document={
                    "hypothesis": "Treatment changes completed signup.",
                    "primary_metric": {"key": "completed_signup", "kind": "binary"},
                    "guardrail_metric": {"key": "crash", "kind": "binary"},
                    "guardrail_harm_margin_percentage_points": 1,
                    "enrollment_ends_at": (anchor + timedelta(hours=1)).isoformat(),
                    "followup_hours": 24,
                    "arrival_lateness_hours": 24,
                    "primary_alpha": 0.05,
                },
                digest="b" * 64,
                frozen_at=anchor,
            )
            session.add_all([configuration, plan])
            session.flush()
            experiment.active_configuration_version_id = configuration.id
            experiment.active_analysis_plan_id = plan.id
            control = Assignment(
                project_id=project_id,
                environment_id=environment_id,
                experiment_id=experiment.id,
                configuration_version_id=configuration.id,
                subject_id="day4-control",
                arm="control",
                assigned_at=anchor + timedelta(minutes=5),
                algorithm_version="sha256-v1",
            )
            treatment = Assignment(
                project_id=project_id,
                environment_id=environment_id,
                experiment_id=experiment.id,
                configuration_version_id=configuration.id,
                subject_id="day4-treatment",
                arm="treatment",
                assigned_at=anchor + timedelta(minutes=6),
                algorithm_version="sha256-v1",
            )
            session.add_all([control, treatment])
            session.flush()
            add_event(
                session,
                experiment=experiment,
                assignment=control,
                event_type="exposure",
                event_id="day4-exposure",
                occurred_at=anchor + timedelta(minutes=7),
            )
            add_event(
                session,
                experiment=experiment,
                assignment=control,
                event_type="completed_signup",
                event_id="day4-outcome",
                occurred_at=anchor + timedelta(hours=2),
            )
            add_event(
                session,
                experiment=experiment,
                assignment=control,
                event_type="completed_signup",
                event_id="day4-late-outcome",
                occurred_at=anchor + timedelta(hours=30),
            )
            session.commit()

            incomplete = derive_cohort_snapshot(
                session,
                experiment_id=experiment.id,
                derivation_version="cohort-compose-incomplete",
                evaluated_at=anchor + timedelta(days=3),
            ).snapshot
            assert incomplete.finalization_ready is False
            assert incomplete.readiness["pipeline_complete"] is False
            record_pipeline_checkpoint(
                session,
                experiment=experiment,
                partition_key="complete-through-cutoff",
                window_start=anchor,
                window_end=anchor + timedelta(hours=49),
                complete=True,
                observed_event_count=3,
            )
            ready = derive_cohort_snapshot(
                session,
                experiment_id=experiment.id,
                derivation_version="cohort-compose-ready",
                evaluated_at=anchor + timedelta(days=3),
            ).snapshot
            assert ready.finalization_ready is True
            assert ready.source_counts["cohort_assignments"] == 2
            assert ready.source_counts["excluded_events"] == 1
            assert ready.arm_counts["treatment"]["exposure_missing"] == 1

            add_event(
                session,
                experiment=experiment,
                assignment=treatment,
                event_type="completed_signup",
                event_id="day4-replayed-outcome",
                occurred_at=anchor + timedelta(hours=2),
            )
            session.commit()
            assert (
                replay_raw_events(
                    session,
                    environment_id=environment_id,
                    derivation_version="events-v2-compose",
                )
                == 4
            )
            replayed = derive_cohort_snapshot(
                session,
                experiment_id=experiment.id,
                derivation_version="cohort-compose-replay",
                event_derivation_version="events-v2-compose",
                evaluated_at=anchor + timedelta(days=3),
            ).snapshot
            assert replayed.checks["event_replay"]["state"] == "complete"
            assert replayed.arm_counts["treatment"]["primary_positive"] == 1
            assert ready.arm_counts["treatment"]["primary_positive"] == 0

        base = (
            f"/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}"
        )
        with httpx.Client(base_url=API_URL, timeout=10) as client:
            quality = client.get(f"{base}/quality", headers=headers(organization_id))
            assert quality.status_code == 200
            assert quality.json()["derivation_version"] == "cohort-compose-replay"
            denied = client.post(
                f"{base}/quality-snapshots",
                json={"derivation_version": "cohort-viewer-denied"},
                headers=headers(organization_id, "viewer"),
            )
            assert denied.status_code == 403
            cross_scope = client.get(
                f"/v1/projects/{project_id}/environments/{sibling_environment_id}"
                f"/experiments/{experiment_id}/quality",
                headers=headers(organization_id),
            )
            assert cross_scope.status_code == 404
        print("Day 4 local PostgreSQL cohort, readiness, scope, and replay verification passed.")
    finally:
        with Session(engine) as session:
            for model in (
                UserFact,
                EventExclusion,
                CohortSnapshot,
                PipelineCheckpoint,
                EventContribution,
                RawEvent,
                Assignment,
            ):
                session.execute(delete(model).where(model.project_id == project_id))
            session.execute(delete(AuditRecord).where(AuditRecord.project_id == project_id))
            experiment = session.get(Experiment, experiment_id)
            if experiment is not None:
                experiment.active_configuration_version_id = None
                experiment.active_analysis_plan_id = None
                session.flush()
                session.execute(
                    delete(ConfigurationVersion).where(
                        ConfigurationVersion.experiment_id == experiment_id
                    )
                )
                session.execute(
                    delete(AnalysisPlan).where(AnalysisPlan.experiment_id == experiment_id)
                )
                session.delete(experiment)
            session.execute(delete(Environment).where(Environment.project_id == project_id))
            session.execute(delete(Project).where(Project.id == project_id))
            session.execute(delete(Organization).where(Organization.id == organization_id))
            session.commit()
        engine.dispose()


if __name__ == "__main__":
    main()
