import uuid
from datetime import UTC, datetime, timedelta

import pytest
from scipy.stats import norm
from sqlalchemy import func, select

from app.db.models import (
    AnalysisSnapshot,
    Assignment,
    CohortSnapshot,
    Experiment,
    UserFact,
)
from app.domain.analysis import _recommendation, analyze_binary_metric
from app.schemas import AnalysisPlanDocument
from tests.conftest import local_headers
from tests.test_experiment_lifecycle import experiment_url, payload


def _ready_cohort(
    client, ids, session_factory, *, ready: bool = True
) -> tuple[Experiment, CohortSnapshot]:  # type: ignore[no-untyped-def]
    body = payload(f"analysis-{uuid.uuid4().hex[:8]}")
    plan = body["analysis_plan"]
    assert isinstance(plan, dict)
    plan["guardrail_harm_margin_percentage_points"] = 10
    created = client.post(experiment_url(ids), json=body, headers=local_headers(ids, "editor"))
    assert created.status_code == 201
    experiment_id = uuid.UUID(created.json()["id"])
    approved = client.post(
        f"{experiment_url(ids)}/{experiment_id}/approve",
        json={"expected_version": 1},
        headers=local_headers(ids, "approver"),
    )
    assert approved.status_code == 200
    anchor = datetime.now(UTC) - timedelta(days=4)
    with session_factory() as session:
        experiment = session.get(Experiment, experiment_id)
        assert experiment is not None
        assert experiment.active_configuration_version_id is not None
        assert experiment.active_analysis_plan_id is not None
        cohort = CohortSnapshot(
            project_id=experiment.project_id,
            environment_id=experiment.environment_id,
            experiment_id=experiment.id,
            configuration_version_id=experiment.active_configuration_version_id,
            analysis_plan_id=experiment.active_analysis_plan_id,
            derivation_version=f"cohort-analysis-{uuid.uuid4().hex[:8]}",
            event_derivation_version="events-v1",
            evaluated_at=anchor + timedelta(days=3),
            arrival_cutoff_at=anchor + timedelta(days=2),
            source_counts={"cohort_assignments": 400},
            arm_counts={
                "control": {"assigned": 200},
                "treatment": {"assigned": 200},
            },
            checks={"source_complete": ready},
            readiness={"source_complete": ready},
            finalization_ready=ready,
        )
        session.add(cohort)
        session.flush()
        for arm, primary_successes in (("control", 40), ("treatment", 80)):
            for index in range(200):
                assignment = Assignment(
                    project_id=experiment.project_id,
                    environment_id=experiment.environment_id,
                    experiment_id=experiment.id,
                    configuration_version_id=experiment.active_configuration_version_id,
                    subject_id=f"{arm}-{index}-{cohort.id}",
                    arm=arm,
                    assigned_at=anchor,
                    algorithm_version="sha256-v1",
                )
                session.add(assignment)
                session.flush()
                for metric_key, value in (
                    ("completed_signup", index < primary_successes),
                    ("crash", index < 10),
                ):
                    session.add(
                        UserFact(
                            project_id=experiment.project_id,
                            environment_id=experiment.environment_id,
                            experiment_id=experiment.id,
                            assignment_id=assignment.id,
                            arm=arm,
                            metric_key=metric_key,
                            value=value,
                            window_start=anchor,
                            window_end=anchor + timedelta(days=1),
                            derivation_version=cohort.derivation_version,
                        )
                    )
        session.commit()
        session.refresh(experiment)
        session.refresh(cohort)
        return experiment, cohort


def test_score_fixture_and_sparse_behavior() -> None:
    result = analyze_binary_metric(
        treatment_successes=80,
        treatment_total=200,
        control_successes=40,
        control_total=200,
        alpha=0.05,
        correction=False,
    )
    assert result["state"] == "complete"
    assert result["absolute_difference_percentage_points"] == pytest.approx(20.0)
    assert result["relative_lift"] == pytest.approx(1.0)
    pooled_rate = (80 + 40) / (200 + 200)
    pooled_standard_error = (pooled_rate * (1 - pooled_rate) * (1 / 200 + 1 / 200)) ** 0.5
    independently_calculated_statistic = 0.2 / pooled_standard_error
    independently_calculated_p_value = 2 * norm.sf(independently_calculated_statistic)
    assert result["statistic"] == pytest.approx(independently_calculated_statistic)
    assert result["p_value"] == pytest.approx(independently_calculated_p_value)
    assert result["confidence_interval"]["low_percentage_points"] > 10
    assert result["confidence_interval"]["high_percentage_points"] < 30

    sparse = analyze_binary_metric(
        treatment_successes=0,
        treatment_total=4,
        control_successes=0,
        control_total=4,
        alpha=0.05,
    )
    assert sparse["state"] == "insufficient_information"
    assert sparse["confidence_interval"] is None


def test_complete_cohort_creates_immutable_human_gated_snapshot(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    experiment, cohort = _ready_cohort(client, ids, session_factory)
    url = f"{experiment_url(ids)}/{experiment.id}/analysis-snapshots"
    request = {"cohort_snapshot_id": str(cohort.id), "analysis_version": "analysis-v1"}
    assert client.post(url, json=request, headers=local_headers(ids)).status_code == 403

    created = client.post(url, json=request, headers=local_headers(ids, "approver"))
    assert created.status_code == 200
    result = created.json()
    assert result["created"] is True
    assert result["recommendation"] == "eligible_for_human_approval"
    assert result["results"]["guardrail"]["acceptable"] is True
    assert result["results"]["recommendation_policy"] == (
        "human_approval_required_no_automatic_rollout"
    )
    assert result["library_versions"]["statsmodels"] == "0.15.0"

    repeated = client.post(url, json=request, headers=local_headers(ids, "approver"))
    assert repeated.status_code == 200
    assert repeated.json()["created"] is False
    assert repeated.json()["id"] == result["id"]
    read = client.get(f"{experiment_url(ids)}/{experiment.id}/analysis", headers=local_headers(ids))
    assert read.status_code == 200
    cross_scope = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}"
        f"/experiments/{experiment.id}/analysis"
    )
    assert client.get(cross_scope, headers=local_headers(ids)).status_code == 404
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AnalysisSnapshot)) == 1


def test_incomplete_cohort_cannot_produce_recommendation(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    experiment, cohort = _ready_cohort(client, ids, session_factory, ready=False)
    response = client.post(
        f"{experiment_url(ids)}/{experiment.id}/analysis-snapshots",
        json={"cohort_snapshot_id": str(cohort.id), "analysis_version": "analysis-v1"},
        headers=local_headers(ids, "approver"),
    )
    assert response.status_code == 409
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AnalysisSnapshot)) == 0


def test_nonsignificant_guardrail_harm_is_not_safety() -> None:
    result = analyze_binary_metric(
        treatment_successes=11,
        treatment_total=100,
        control_successes=10,
        control_total=100,
        alpha=0.05,
        alternative="smaller",
        null_difference=0.01,
        interval_alpha=0.10,
    )
    assert result["state"] == "complete"
    assert result["p_value"] > 0.05
    assert result["confidence_interval"]["high"] > 0.01


def test_recommendation_precedence_is_fixed() -> None:
    plan = AnalysisPlanDocument.model_validate(payload()["analysis_plan"])
    primary = {
        "state": "complete",
        "p_value": 0.01,
        "confidence_interval": {"low": 0.02, "high": 0.20},
    }
    uncertain_guardrail = {
        "state": "complete",
        "acceptable": False,
        "harm_confirmed": False,
    }
    assert (
        _recommendation(primary=primary, guardrail=uncertain_guardrail, plan=plan) == "inconclusive"
    )
    safe_guardrail = {**uncertain_guardrail, "acceptable": True}
    assert (
        _recommendation(primary=primary, guardrail=safe_guardrail, plan=plan)
        == "eligible_for_human_approval"
    )
    harmful_guardrail = {**uncertain_guardrail, "harm_confirmed": True}
    assert (
        _recommendation(primary=primary, guardrail=harmful_guardrail, plan=plan) == "do_not_launch"
    )
    degraded_primary = {
        "state": "complete",
        "p_value": 0.01,
        "confidence_interval": {"low": -0.20, "high": -0.02},
    }
    assert (
        _recommendation(primary=degraded_primary, guardrail=safe_guardrail, plan=plan)
        == "do_not_launch"
    )
