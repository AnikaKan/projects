import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from app.db.models import AnalysisSnapshot, AuditRecord, Decision, OperationalAlert
from app.observability import OperationalMetrics
from tests.conftest import local_headers
from tests.test_experiment_lifecycle import experiment_url
from tests.test_statistical_analysis import _ready_cohort


def _analysis(client, ids, session_factory):  # type: ignore[no-untyped-def]
    experiment, cohort = _ready_cohort(client, ids, session_factory)
    response = client.post(
        f"{experiment_url(ids)}/{experiment.id}/analysis-snapshots",
        json={"cohort_snapshot_id": str(cohort.id), "analysis_version": "analysis-v1"},
        headers=local_headers(ids, "approver"),
    )
    assert response.status_code == 200
    return experiment, response.json()


def test_human_decision_is_scoped_audited_and_never_rolls_out(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    experiment, analysis = _analysis(client, ids, session_factory)
    url = f"{experiment_url(ids)}/{experiment.id}/analysis/{analysis['id']}/decisions"
    payload = {
        "action": "approve_launch",
        "rationale": "The practical threshold and guardrail requirements passed.",
        "rollout_reference": "local-demo-change-001",
    }
    assert client.post(url, json=payload, headers=local_headers(ids)).status_code == 403
    missing_reference = {**payload, "rollout_reference": None}
    assert (
        client.post(url, json=missing_reference, headers=local_headers(ids, "approver")).status_code
        == 422
    )
    created = client.post(url, json=payload, headers=local_headers(ids, "approver"))
    assert created.status_code == 201
    assert created.json()["snapshot_id"] == analysis["id"]
    assert created.json()["action"] == "approve_launch"
    assert client.post(url, json=payload, headers=local_headers(ids, "approver")).status_code == 409
    listed = client.get(
        f"{experiment_url(ids)}/{experiment.id}/decisions", headers=local_headers(ids)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    cross_scope = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}"
        f"/experiments/{experiment.id}/decisions"
    )
    assert client.get(cross_scope, headers=local_headers(ids)).status_code == 404
    with session_factory() as session:
        assert len(list(session.scalars(select(Decision)))) == 1
        audit = session.scalar(
            select(AuditRecord).where(AuditRecord.action == "analysis_decision.recorded")
        )
        assert audit is not None
        assert audit.detail["automatic_rollout"] is False


def test_invalidation_is_admin_only_and_blocks_future_decisions(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    experiment, analysis = _analysis(client, ids, session_factory)
    invalidate_url = f"{experiment_url(ids)}/{experiment.id}/analysis/{analysis['id']}/invalidate"
    reason = {"reason": "Synthetic source evidence was intentionally marked invalid."}
    assert (
        client.post(invalidate_url, json=reason, headers=local_headers(ids, "approver")).status_code
        == 403
    )
    invalidated = client.post(
        invalidate_url, json=reason, headers=local_headers(ids, "administrator")
    )
    assert invalidated.status_code == 200
    decision_url = f"{experiment_url(ids)}/{experiment.id}/analysis/{analysis['id']}/decisions"
    blocked = client.post(
        decision_url,
        json={
            "action": "reject_launch",
            "rationale": "The retained snapshot was invalidated and cannot support a decision.",
        },
        headers=local_headers(ids, "approver"),
    )
    assert blocked.status_code == 409
    read = client.get(f"{experiment_url(ids)}/{experiment.id}/analysis", headers=local_headers(ids))
    assert read.status_code == 200
    assert read.json()["invalidated_at"] is not None
    with session_factory() as session:
        snapshot = session.get(AnalysisSnapshot, uuid.UUID(analysis["id"]))
        assert snapshot is not None and snapshot.invalidated_at is not None


def test_operations_status_and_local_alert_sink_are_honest(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    base = f"/v1/projects/{ids['project']}/environments/{ids['environment']}/operations"
    assert client.get("/health/ready").status_code == 200
    status_response = client.get(f"{base}/status", headers=local_headers(ids))
    assert status_response.status_code == 200
    status_body = status_response.json()
    assert status_body["request_metrics"]["request_count"] >= 1
    assert "checked_out" in status_body["database_pool"]
    assert status_body["event_pipeline"]["source"] == "in_memory_test_queue"
    assert "local" in status_body["evidence_scope"]
    payload = {"recipient_label": "synthetic-local-operator"}
    assert (
        client.post(f"{base}/test-alert", json=payload, headers=local_headers(ids)).status_code
        == 403
    )
    delivered = client.post(
        f"{base}/test-alert", json=payload, headers=local_headers(ids, "administrator")
    )
    assert delivered.status_code == 201
    assert delivered.json()["destination"] == "local_database_test_sink"
    assert delivered.json()["delivery_status"] == "delivered_locally"
    with session_factory() as session:
        alert = session.scalar(select(OperationalAlert))
        assert alert is not None and alert.is_test is True


def test_request_concurrency_limit_returns_bounded_overload(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    client.app.state.operational_metrics = OperationalMetrics(concurrency_limit=1)

    def slow_request():  # type: ignore[no-untyped-def]
        return client.get(
            "/health/ready",
            headers={"X-Local-Fault-Delay-Ms": "250"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        slow = executor.submit(slow_request)
        time.sleep(0.05)
        overloaded = client.get("/health/ready")
        completed = slow.result()
    assert completed.status_code == 200
    assert overloaded.status_code == 503
    assert overloaded.headers["Retry-After"] == "1"
    assert client.app.state.operational_metrics.snapshot()["overload_rejections"] == 1


def test_malformed_local_fault_delay_is_ignored(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = seeded_app
    response = client.get(
        "/health/ready",
        headers={"X-Local-Fault-Delay-Ms": "not-a-number"},
    )
    assert response.status_code == 200
