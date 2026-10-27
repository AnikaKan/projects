from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import AuditRecord
from tests.conftest import local_headers


def payload(key: str = "welcome", traffic: int = 10_000) -> dict[str, object]:
    return {
        "key": key,
        "name": f"{key} experiment",
        "configuration": {
            "identity_namespace": "test-subject",
            "traffic_allocation_basis_points": traffic,
            "salt": "test-salt-which-is-long-enough",
            "arms": [
                {"key": "control", "allocation_basis_points": 5000},
                {"key": "treatment", "allocation_basis_points": 5000},
            ],
            "eligibility": {"attribute": "market", "allowed_values": ["US"]},
        },
        "analysis_plan": {
            "hypothesis": "The treatment increases completed signup.",
            "primary_metric": {"key": "completed_signup", "kind": "binary"},
            "guardrail_metric": {"key": "crash", "kind": "binary"},
            "guardrail_harm_margin_percentage_points": 1,
            "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
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
    }


def experiment_url(ids: dict[str, object]) -> str:
    return f"/v1/projects/{ids['project']}/environments/{ids['environment']}/experiments"


def test_lifecycle_roles_immutability_and_audit(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    url = experiment_url(ids)
    assert client.post(url, json=payload(), headers=local_headers(ids)).status_code == 403
    created = client.post(url, json=payload(), headers=local_headers(ids, "editor"))
    assert created.status_code == 201
    draft = created.json()
    assert draft["status"] == "draft"

    denied = client.post(
        f"{url}/{draft['id']}/approve",
        json={"expected_version": 1},
        headers=local_headers(ids, "editor"),
    )
    assert denied.status_code == 403
    approved = client.post(
        f"{url}/{draft['id']}/approve",
        json={"expected_version": 1},
        headers=local_headers(ids, "approver"),
    )
    assert approved.status_code == 200
    approved_body = approved.json()
    assert approved_body["status"] == "approved"

    immutable = client.put(
        f"{url}/{draft['id']}",
        json={"expected_version": 2, "name": "changed", **payload()},
        headers=local_headers(ids, "editor"),
    )
    assert immutable.status_code == 409
    stale = client.post(
        f"{url}/{draft['id']}/launch",
        json={"expected_version": 1},
        headers=local_headers(ids, "approver"),
    )
    assert stale.status_code == 409
    launched = client.post(
        f"{url}/{draft['id']}/launch",
        json={"expected_version": 2},
        headers=local_headers(ids, "approver"),
    )
    assert launched.status_code == 200
    assert launched.json()["status"] == "running"

    with session_factory() as session:
        actions = set(session.scalars(select(AuditRecord.action)).all())
    assert {"experiment.created", "experiment.approved", "experiment.launched"} <= actions


def test_only_one_active_experiment_and_environment_scope(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    url = experiment_url(ids)
    first = client.post(url, json=payload("first"), headers=local_headers(ids, "editor")).json()
    second = client.post(url, json=payload("second"), headers=local_headers(ids, "editor")).json()
    for experiment in (first, second):
        approved = client.post(
            f"{url}/{experiment['id']}/approve",
            json={"expected_version": 1},
            headers=local_headers(ids, "approver"),
        )
        assert approved.status_code == 200
    assert (
        client.post(
            f"{url}/{first['id']}/launch",
            json={"expected_version": 2},
            headers=local_headers(ids, "approver"),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{url}/{second['id']}/launch",
            json={"expected_version": 2},
            headers=local_headers(ids, "approver"),
        ).status_code
        == 409
    )

    cross_environment = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}"
        f"/experiments/{first['id']}"
    )
    assert client.get(cross_environment, headers=local_headers(ids)).status_code == 404
