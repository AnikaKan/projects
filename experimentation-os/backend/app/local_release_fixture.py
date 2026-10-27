"""Seed an isolated mature release fixture; local environment only."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.config import RuntimeEnvironment, Settings
from app.db.models import (
    AnalysisPlan,
    Assignment,
    ConfigurationVersion,
    Environment,
    EventContribution,
    Experiment,
    ExperimentStatus,
    RawEvent,
)
from app.db.session import create_database_engine
from app.domain.analysis import derive_analysis_snapshot
from app.domain.cohorts import derive_cohort_snapshot, record_pipeline_checkpoint


def required_uuid(name: str) -> uuid.UUID:
    value = os.environ.get(name)
    if value is None:
        raise RuntimeError(f"{name} is required")
    return uuid.UUID(value)


def add_event(
    session: Session,
    *,
    assignment: Assignment,
    experiment: Experiment,
    event_type: str,
    occurred_at: datetime,
    suffix: str,
) -> None:
    event_id = f"{event_type}-{assignment.subject_id}-{suffix}"
    raw = RawEvent(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        assignment_id=assignment.id,
        experiment_id=experiment.id,
        event_id=event_id,
        schema_version="1",
        event_type=event_type,
        source_identity=assignment.subject_id,
        correlation_id=f"release-{event_id}",
        payload_hash=hashlib.sha256(b"{}").hexdigest(),
        payload={},
        occurred_at=occurred_at,
        ingested_at=occurred_at,
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


def main() -> None:
    settings = Settings()
    if settings.environment is not RuntimeEnvironment.LOCAL:
        raise RuntimeError("the release fixture is allowed only in the local environment")
    organization_id = required_uuid("DAY7_ORGANIZATION_ID")
    project_id = required_uuid("DAY7_PROJECT_ID")
    environment_id = required_uuid("DAY7_ANALYSIS_ENVIRONMENT_ID")
    suffix = os.environ.get("DAY7_FIXTURE_SUFFIX", uuid.uuid4().hex[:8])
    anchor = datetime.now(UTC) - timedelta(days=4)
    enrollment_end = anchor + timedelta(hours=1)
    engine = create_database_engine(settings.database_url)
    with Session(engine) as session:
        session.add(
            Environment(
                id=environment_id,
                project_id=project_id,
                key=f"analysis-{suffix}",
                name="Day 7 isolated analysis fixture",
            )
        )
        experiment = Experiment(
            project_id=project_id,
            environment_id=environment_id,
            key=f"analysis-{suffix}",
            name="Day 7 finalized browser workflow",
            owner_subject="day7-approver@example.test",
            status=ExperimentStatus.ENROLLMENT_CLOSED,
            version=4,
            launched_at=anchor,
            enrollment_closed_at=enrollment_end,
        )
        session.add(experiment)
        session.flush()
        configuration = ConfigurationVersion(
            experiment_id=experiment.id,
            version=1,
            document={
                "identity_namespace": "day7-release-fixture",
                "traffic_allocation_basis_points": 10_000,
                "salt": f"day7-release-fixture-salt-{suffix}",
                "algorithm_version": "sha256-v1",
                "arms": [
                    {"key": "control", "allocation_basis_points": 5_000},
                    {"key": "treatment", "allocation_basis_points": 5_000},
                ],
                "eligibility": None,
                "safe_fallback": "unavailable",
            },
            digest=hashlib.sha256(f"configuration-{suffix}".encode()).hexdigest(),
            approved_at=anchor,
            approved_by_subject="day7-approver@example.test",
        )
        plan = AnalysisPlan(
            experiment_id=experiment.id,
            version=1,
            document={
                "hypothesis": "Treatment increases completed signup without excess crashes.",
                "primary_metric": {"key": "completed_signup", "kind": "binary"},
                "guardrail_metric": {"key": "crash", "kind": "binary"},
                "guardrail_harm_margin_percentage_points": 10,
                "enrollment_ends_at": enrollment_end.isoformat(),
                "followup_hours": 24,
                "arrival_lateness_hours": 24,
                "primary_alpha": 0.05,
                "baseline_rate": 0.2,
                "guardrail_baseline_rate": 0.1,
                "minimum_detectable_effect_percentage_points": 20,
                "desired_power": 0.8,
                "practical_significance_threshold_percentage_points": 1,
                "practical_threshold_semantics": "lower_confidence_bound_above",
                "primary_test_method": "score",
                "primary_interval_method": "score",
                "score_correction": True,
                "guardrail_one_sided_alpha": 0.05,
            },
            digest=hashlib.sha256(f"analysis-plan-{suffix}".encode()).hexdigest(),
            frozen_at=anchor,
        )
        session.add_all((configuration, plan))
        session.flush()
        experiment.active_configuration_version_id = configuration.id
        experiment.active_analysis_plan_id = plan.id

        event_count = 0
        for arm in ("control", "treatment"):
            for index in range(20):
                assigned_at = anchor + timedelta(minutes=index + 1)
                assignment = Assignment(
                    project_id=project_id,
                    environment_id=environment_id,
                    experiment_id=experiment.id,
                    configuration_version_id=configuration.id,
                    subject_id=f"day7-{arm}-{index:02d}-{suffix}",
                    arm=arm,
                    assigned_at=assigned_at,
                    algorithm_version="sha256-v1",
                )
                session.add(assignment)
                session.flush()
                add_event(
                    session,
                    assignment=assignment,
                    experiment=experiment,
                    event_type="exposure",
                    occurred_at=assigned_at + timedelta(minutes=1),
                    suffix=suffix,
                )
                event_count += 1
                primary_successes = 4 if arm == "control" else 12
                if index < primary_successes:
                    add_event(
                        session,
                        assignment=assignment,
                        experiment=experiment,
                        event_type="completed_signup",
                        occurred_at=assigned_at + timedelta(hours=2),
                        suffix=suffix,
                    )
                    event_count += 1
                guardrail_successes = 2 if arm == "control" else 1
                if index < guardrail_successes:
                    add_event(
                        session,
                        assignment=assignment,
                        experiment=experiment,
                        event_type="crash",
                        occurred_at=assigned_at + timedelta(hours=3),
                        suffix=suffix,
                    )
                    event_count += 1
        session.commit()
        record_pipeline_checkpoint(
            session,
            experiment=experiment,
            partition_key=f"day7-complete-{suffix}",
            window_start=anchor,
            window_end=enrollment_end + timedelta(hours=48),
            complete=True,
            observed_event_count=event_count,
        )
        cohort = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version=f"cohort-day7-{suffix}",
            evaluated_at=datetime.now(UTC),
        ).snapshot
        if not cohort.finalization_ready:
            raise RuntimeError(f"release fixture was not finalization ready: {cohort.readiness}")
        analysis = derive_analysis_snapshot(
            session,
            cohort_snapshot_id=cohort.id,
            analysis_version=f"analysis-day7-{suffix}",
        ).snapshot
        print(
            json.dumps(
                {
                    "organization_id": str(organization_id),
                    "project_id": str(project_id),
                    "environment_id": str(environment_id),
                    "experiment_id": str(experiment.id),
                    "cohort_snapshot_id": str(cohort.id),
                    "analysis_snapshot_id": str(analysis.id),
                    "recommendation": analysis.recommendation,
                    "finalization_ready": cohort.finalization_ready,
                },
                sort_keys=True,
            )
        )
    engine.dispose()


if __name__ == "__main__":
    main()
