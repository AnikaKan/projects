import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.db.models import (
    AnalysisPlan,
    Assignment,
    CohortSnapshot,
    ConfigurationVersion,
    EventContribution,
    EventExclusion,
    Experiment,
    ExperimentStatus,
    RawEvent,
    UserFact,
)
from app.domain.cohorts import (
    EXPOSURE_METRIC_KEY,
    derive_cohort_snapshot,
    record_pipeline_checkpoint,
)
from app.domain.events import replay_raw_events
from tests.conftest import local_headers


def seed_experiment(session, ids, *, anchor: datetime, closed: bool = True):  # type: ignore[no-untyped-def]
    experiment = Experiment(
        project_id=ids["project"],
        environment_id=ids["environment"],
        key=f"quality-{uuid.uuid4().hex[:8]}",
        name="Quality test",
        owner_subject="operator@example.test",
        status=ExperimentStatus.ENROLLMENT_CLOSED if closed else ExperimentStatus.RUNNING,
        version=4 if closed else 3,
        launched_at=anchor,
        enrollment_closed_at=anchor + timedelta(hours=1) if closed else None,
    )
    session.add(experiment)
    session.flush()
    configuration = ConfigurationVersion(
        experiment_id=experiment.id,
        version=1,
        document={
            "identity_namespace": "quality-test",
            "traffic_allocation_basis_points": 10_000,
            "salt": "quality-test-salt-long-enough",
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
        approved_by_subject="approver@example.test",
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
            "baseline_rate": 0.2,
            "guardrail_baseline_rate": 0.01,
            "minimum_detectable_effect_percentage_points": 2,
            "desired_power": 0.8,
            "practical_significance_threshold_percentage_points": 1,
            "practical_threshold_semantics": "lower_confidence_bound_above",
            "primary_test_method": "score",
            "primary_interval_method": "score",
            "score_correction": True,
            "guardrail_one_sided_alpha": 0.05,
        },
        digest="b" * 64,
        frozen_at=anchor,
    )
    session.add_all([configuration, plan])
    session.flush()
    experiment.active_configuration_version_id = configuration.id
    experiment.active_analysis_plan_id = plan.id
    session.commit()
    return experiment, configuration, plan


def add_assignment(session, experiment, configuration, *, arm: str, subject: str, at: datetime):  # type: ignore[no-untyped-def]
    assignment = Assignment(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        configuration_version_id=configuration.id,
        subject_id=subject,
        arm=arm,
        assigned_at=at,
        algorithm_version="sha256-v1",
    )
    session.add(assignment)
    session.flush()
    return assignment


def add_event(
    session,
    experiment,
    assignment,
    *,
    event_type: str,
    occurred_at: datetime,
    event_id: str,
    ingested_at: datetime | None = None,
):  # type: ignore[no-untyped-def]
    raw = RawEvent(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        assignment_id=assignment.id,
        event_id=event_id,
        schema_version="1",
        event_type=event_type,
        source_identity=assignment.subject_id,
        correlation_id=f"correlation-{event_id}",
        payload_hash="c" * 64,
        payload={},
        occurred_at=occurred_at,
        ingested_at=ingested_at or occurred_at,
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


def complete_pipeline(session, experiment, *, anchor: datetime, observed: int) -> None:  # type: ignore[no-untyped-def]
    record_pipeline_checkpoint(
        session,
        experiment=experiment,
        partition_key="complete-through-cutoff",
        window_start=anchor,
        window_end=anchor + timedelta(hours=49),
        complete=True,
        observed_event_count=observed,
    )


def test_assigned_subject_cohort_windows_and_readiness(seeded_app) -> None:  # type: ignore[no-untyped-def]
    _, ids, session_factory = seeded_app
    anchor = datetime.now(UTC) - timedelta(days=4)
    with session_factory() as session:
        experiment, configuration, _ = seed_experiment(session, ids, anchor=anchor)
        control = add_assignment(
            session,
            experiment,
            configuration,
            arm="control",
            subject="control-subject",
            at=anchor + timedelta(minutes=5),
        )
        add_assignment(
            session,
            experiment,
            configuration,
            arm="treatment",
            subject="unexposed-treatment-subject",
            at=anchor + timedelta(minutes=10),
        )
        add_event(
            session,
            experiment,
            control,
            event_type="exposure",
            occurred_at=anchor + timedelta(minutes=6),
            event_id="exposure-in-window",
        )
        add_event(
            session,
            experiment,
            control,
            event_type="completed_signup",
            occurred_at=anchor + timedelta(hours=2),
            event_id="outcome-in-window",
        )
        add_event(
            session,
            experiment,
            control,
            event_type="completed_signup",
            occurred_at=anchor + timedelta(hours=30),
            event_id="outcome-after-window",
        )
        session.commit()
        complete_pipeline(session, experiment, anchor=anchor, observed=3)
        result = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            evaluated_at=anchor + timedelta(days=3),
        )
        assert result.created is True
        assert result.snapshot.finalization_ready is True
        assert result.snapshot.source_counts["cohort_assignments"] == 2
        assert result.snapshot.source_counts["excluded_events"] == 1
        assert result.snapshot.arm_counts["treatment"]["exposure_missing"] == 1
        assert session.scalar(select(func.count()).select_from(UserFact)) == 6
        assert session.scalar(select(func.count()).select_from(EventExclusion)) == 1
        treatment_primary = session.scalar(
            select(UserFact).where(
                UserFact.arm == "treatment",
                UserFact.metric_key == "completed_signup",
            )
        )
        assert treatment_primary is not None and treatment_primary.value is False
        assert result.snapshot.checks["exposure_loss"]["treatment"]["missing"] == 1


def test_missing_partitions_and_immature_subjects_block_finalization(seeded_app) -> None:  # type: ignore[no-untyped-def]
    _, ids, session_factory = seeded_app
    anchor = datetime.now(UTC) - timedelta(hours=2)
    with session_factory() as session:
        experiment, configuration, _ = seed_experiment(session, ids, anchor=anchor)
        add_assignment(
            session,
            experiment,
            configuration,
            arm="control",
            subject="immature-subject",
            at=anchor + timedelta(minutes=5),
        )
        session.commit()
        result = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            evaluated_at=anchor + timedelta(hours=3),
        )
        assert result.snapshot.finalization_ready is False
        assert result.snapshot.readiness["all_subjects_mature"] is False
        assert result.snapshot.readiness["arrival_allowance_elapsed"] is False
        assert result.snapshot.readiness["pipeline_complete"] is False
        assert result.snapshot.checks["pipeline_coverage"]["coverage_gaps"]


def test_versioned_replay_is_immutable_and_reconciles_raw_records(seeded_app) -> None:  # type: ignore[no-untyped-def]
    _, ids, session_factory = seeded_app
    anchor = datetime.now(UTC) - timedelta(days=4)
    with session_factory() as session:
        experiment, configuration, _ = seed_experiment(session, ids, anchor=anchor)
        assignment = add_assignment(
            session,
            experiment,
            configuration,
            arm="control",
            subject="replay-subject",
            at=anchor + timedelta(minutes=5),
        )
        add_event(
            session,
            experiment,
            assignment,
            event_type="exposure",
            occurred_at=anchor + timedelta(minutes=6),
            event_id="replay-exposure",
        )
        session.commit()
        complete_pipeline(session, experiment, anchor=anchor, observed=1)
        first = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version="cohort-v1-test",
            evaluated_at=anchor + timedelta(days=3),
        )
        add_event(
            session,
            experiment,
            assignment,
            event_type="completed_signup",
            occurred_at=anchor + timedelta(hours=1),
            event_id="replay-outcome",
        )
        session.commit()
        assert (
            replay_raw_events(
                session,
                environment_id=experiment.environment_id,
                derivation_version="events-v2-quality",
            )
            == 2
        )
        second = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version="cohort-v2-test",
            event_derivation_version="events-v2-quality",
            evaluated_at=anchor + timedelta(days=3),
        )
        repeated = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version="cohort-v1-test",
            evaluated_at=anchor + timedelta(days=5),
        )
        assert repeated.created is False
        assert first.snapshot.arm_counts["control"]["primary_positive"] == 0
        assert repeated.snapshot.id == first.snapshot.id
        assert second.snapshot.arm_counts["control"]["primary_positive"] == 1
        assert second.snapshot.checks["event_replay"]["state"] == "complete"
        assert session.scalar(select(func.count()).select_from(CohortSnapshot)) == 2


@pytest.mark.parametrize(
    ("scenario", "control_count", "treatment_count", "expected_srm"),
    [
        ("aa", 10, 10, "pass"),
        ("benefit", 10, 10, "pass"),
        ("harm", 10, 10, "pass"),
        ("inconclusive", 1, 1, "insufficient_sample"),
        ("srm", 20, 0, "alert"),
        ("logging-outage", 10, 10, "pass"),
    ],
)
def test_isolated_quality_scenarios(
    seeded_app, scenario: str, control_count: int, treatment_count: int, expected_srm: str
) -> None:  # type: ignore[no-untyped-def]
    _, ids, session_factory = seeded_app
    anchor = datetime.now(UTC) - timedelta(days=4)
    with session_factory() as session:
        experiment, configuration, _ = seed_experiment(session, ids, anchor=anchor)
        for arm, count in (("control", control_count), ("treatment", treatment_count)):
            for index in range(count):
                assignment = add_assignment(
                    session,
                    experiment,
                    configuration,
                    arm=arm,
                    subject=f"{scenario}-{arm}-{index}",
                    at=anchor + timedelta(minutes=5),
                )
                add_event(
                    session,
                    experiment,
                    assignment,
                    event_type="exposure",
                    occurred_at=anchor + timedelta(minutes=6),
                    event_id=f"{scenario}-{arm}-{index}-exposure",
                )
                if scenario == "benefit" and arm == "treatment" and index < 7:
                    add_event(
                        session,
                        experiment,
                        assignment,
                        event_type="completed_signup",
                        occurred_at=anchor + timedelta(hours=1),
                        event_id=f"{scenario}-{arm}-{index}-outcome",
                    )
                if scenario == "harm" and arm == "treatment" and index < 4:
                    add_event(
                        session,
                        experiment,
                        assignment,
                        event_type="crash",
                        occurred_at=anchor + timedelta(hours=1),
                        event_id=f"{scenario}-{arm}-{index}-guardrail",
                    )
        session.commit()
        if scenario != "logging-outage":
            complete_pipeline(
                session,
                experiment,
                anchor=anchor,
                observed=control_count + treatment_count,
            )
        snapshot = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version=f"cohort-{scenario}",
            evaluated_at=anchor + timedelta(days=3),
        ).snapshot
        assert snapshot.checks["srm"]["state"] == expected_srm
        assert snapshot.source_counts["cohort_assignments"] == control_count + treatment_count
        if scenario == "benefit":
            assert snapshot.arm_counts["treatment"]["primary_positive"] == 7
        if scenario == "harm":
            assert snapshot.arm_counts["treatment"]["guardrail_positive"] == 4
        if scenario == "inconclusive":
            assert snapshot.checks["srm"]["state"] == "insufficient_sample"
        if scenario == "srm":
            assert snapshot.finalization_ready is False
            assert snapshot.readiness["allocation_balance_clear"] is False
        if scenario == "logging-outage":
            assert snapshot.finalization_ready is False
            assert snapshot.readiness["pipeline_complete"] is False


def test_quality_api_scope_roles_and_actual_counts(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    anchor = datetime.now(UTC) - timedelta(days=4)
    with session_factory() as session:
        experiment, configuration, _ = seed_experiment(session, ids, anchor=anchor)
        add_assignment(
            session,
            experiment,
            configuration,
            arm="control",
            subject="api-quality-subject",
            at=anchor + timedelta(minutes=5),
        )
        session.commit()
        complete_pipeline(session, experiment, anchor=anchor, observed=0)
        experiment_id = experiment.id
    base = (
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}"
        f"/experiments/{experiment_id}"
    )
    assert client.get(f"{base}/quality", headers=local_headers(ids)).status_code == 404
    assert (
        client.post(
            f"{base}/quality-snapshots",
            json={"derivation_version": "cohort-api"},
            headers=local_headers(ids, "viewer"),
        ).status_code
        == 403
    )
    created = client.post(
        f"{base}/quality-snapshots",
        json={"derivation_version": "cohort-api"},
        headers=local_headers(ids, "editor"),
    )
    assert created.status_code == 200
    assert created.json()["source_counts"]["cohort_assignments"] == 1
    cross_scope = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}"
        f"/experiments/{experiment_id}/quality"
    )
    assert client.get(cross_scope, headers=local_headers(ids)).status_code == 404
    assert client.get(f"{base}/quality", headers=local_headers(ids)).status_code == 200
    with session_factory() as session:
        facts = session.scalars(select(UserFact.metric_key)).all()
        assert set(facts) == {EXPOSURE_METRIC_KEY, "completed_signup", "crash"}
