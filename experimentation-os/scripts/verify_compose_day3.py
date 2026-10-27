"""Verify Day 3 against local PostgreSQL, LocalStack SQS, API, and worker."""

from __future__ import annotations

import os
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import AuthMode, RuntimeEnvironment, Settings  # noqa: E402
from app.db.session import (  # noqa: E402
    create_database_engine,
    create_session_factory,
)
from app.domain.events import (  # noqa: E402
    InjectedWorkerCrash,
    ProcessingResult,
    event_envelope,
    process_delivery,
    replay_raw_events,
)
from app.event_queue import QueueDelivery  # noqa: E402
from app.schemas import EventItem  # noqa: E402

API_URL = os.environ.get("EXPERIMENTOS_API_URL", "http://localhost:8000")
DATABASE_URL = os.environ.get(
    "EXPERIMENTOS_COMPOSE_DATABASE_URL",
    "postgresql://experimentos:experimentos@localhost:5432/experimentos",
)
SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
PROJECT_COUNT_QUERIES = (
    "SELECT count(*) FROM raw_events WHERE project_id = %s",
    "SELECT count(*) FROM event_contributions WHERE project_id = %s",
    "SELECT count(*) FROM event_receipts WHERE project_id = %s",
    "SELECT count(*) FROM quarantined_events WHERE project_id = %s",
)
PROJECT_CLEANUP_QUERIES = (
    "DELETE FROM event_contributions WHERE project_id = %s",
    "DELETE FROM quarantined_events WHERE project_id = %s",
    "DELETE FROM event_receipts WHERE project_id = %s",
    "DELETE FROM raw_events WHERE project_id = %s",
    "DELETE FROM assignments WHERE project_id = %s",
)


def expect(response: httpx.Response, status_code: int, label: str) -> None:
    if response.status_code != status_code:
        raise AssertionError(
            f"{label}: expected {status_code}, got {response.status_code}: {response.text[:300]}"
        )


def operator_headers(organization_id: uuid.UUID, role: str) -> dict[str, str]:
    return {
        "X-Local-Subject": "day3-compose-verifier@example.test",
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def wait_for_counts(project_id: uuid.UUID, expected: tuple[int, int, int, int]) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
            counts = []
            for query in PROJECT_COUNT_QUERIES:
                cursor.execute(query, (project_id,))
                row = cursor.fetchone()
                counts.append(int(row[0]) if row else -1)
        if tuple(counts) == expected:
            return
        time.sleep(0.25)
    raise AssertionError(
        f"timed out waiting for event counts {expected}; last counts were {counts}"
    )


def event(
    assignment: dict[str, object],
    *,
    event_id: str,
    event_type: str,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "schema_version": "1",
        "assignment_id": assignment["assignment_id"],
        "assignment_token": assignment["assignment_token"],
        "event_type": event_type,
        "occurred_at": datetime.now(UTC).isoformat(),
        "source_identity": "day3-subject",
        "correlation_id": f"day3-{event_id}",
        "payload": payload or {},
    }


def main() -> None:
    organization_id, project_id, environment_id, sibling_environment_id = [
        uuid.uuid4() for _ in range(4)
    ]
    suffix = organization_id.hex[:10]
    experiment_id: uuid.UUID | None = None
    with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO organizations (id, name) VALUES (%s, %s)",
            (organization_id, f"Day 3 compose verification {suffix}"),
        )
        cursor.execute(
            "INSERT INTO projects (id, organization_id, key, name) VALUES (%s, %s, %s, %s)",
            (project_id, organization_id, f"day3-{suffix}", "Day 3 verification"),
        )
        cursor.execute(
            """
            INSERT INTO environments (id, project_id, key, name)
            VALUES (%s, %s, 'local', 'Local'), (%s, %s, 'sibling', 'Sibling')
            """,
            (environment_id, project_id, sibling_environment_id, project_id),
        )

    base = f"/v1/projects/{project_id}/environments/{environment_id}"
    experiments = f"{base}/experiments"
    try:
        with httpx.Client(base_url=API_URL, timeout=15) as client:
            document = {
                "key": f"events-{suffix}",
                "name": "Day 3 event verification",
                "configuration": {
                    "identity_namespace": "day3-verifier",
                    "traffic_allocation_basis_points": 10_000,
                    "salt": f"day3-verification-salt-{suffix}",
                },
                "analysis_plan": {
                    "hypothesis": "The treatment changes completed signup.",
                    "primary_metric": {"key": "completed_signup"},
                    "guardrail_metric": {"key": "crash"},
                    "guardrail_harm_margin_percentage_points": 1,
                    "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                    "followup_hours": 24,
                    "arrival_lateness_hours": 24,
                },
            }
            created = client.post(
                experiments,
                json=document,
                headers=operator_headers(organization_id, "editor"),
            )
            expect(created, 201, "event experiment creation")
            experiment_id = uuid.UUID(created.json()["id"])
            expect(
                client.post(
                    f"{experiments}/{experiment_id}/approve",
                    json={"expected_version": 1},
                    headers=operator_headers(organization_id, "approver"),
                ),
                200,
                "event experiment approval",
            )
            expect(
                client.post(
                    f"{experiments}/{experiment_id}/launch",
                    json={"expected_version": 2},
                    headers=operator_headers(organization_id, "approver"),
                ),
                200,
                "event experiment launch",
            )
            credential = client.post(
                f"{base}/credentials",
                json={
                    "name": f"day3-verifier-{suffix}",
                    "capabilities": ["assignment", "event_ingestion"],
                },
                headers=operator_headers(organization_id, "administrator"),
            )
            expect(credential, 201, "event credential creation")
            service_headers = {"Authorization": f"Bearer {credential.json()['secret']}"}
            assignment = client.post(
                f"{experiments}/{document['key']}/assignments/resolve",
                json={"subject_id": "day3-subject", "attributes": {}},
                headers=service_headers,
            )
            expect(assignment, 200, "event assignment")
            assignment_body = assignment.json()
            assert assignment_body["state"] == "assigned"
            outcome = event(
                assignment_body,
                event_id=f"outcome-{suffix}",
                event_type="completed_signup",
            )
            exposure = event(assignment_body, event_id=f"exposure-{suffix}", event_type="exposure")
            collected = client.post(
                f"{base}/events:collect",
                json={"events": [outcome, exposure]},
                headers=service_headers,
            )
            expect(collected, 202, "out-of-order event collection")
            wait_for_counts(project_id, (2, 2, 2, 0))

            repeated = client.post(
                f"{base}/events:collect",
                json={"events": [outcome, exposure]},
                headers=service_headers,
            )
            expect(repeated, 202, "duplicate event collection")
            wait_for_counts(project_id, (2, 2, 4, 0))

            conflicting = dict(outcome)
            conflicting["payload"] = {"conflicting": True}
            conflict = client.post(
                f"{base}/events:collect",
                json={"events": [conflicting]},
                headers=service_headers,
            )
            expect(conflict, 202, "conflicting event publication")
            wait_for_counts(project_id, (2, 2, 5, 1))

            partial = client.post(
                f"{base}/events:collect",
                json={
                    "events": [
                        event(
                            assignment_body,
                            event_id=f"guardrail-{suffix}",
                            event_type="crash",
                        ),
                        event(
                            assignment_body,
                            event_id=f"invalid-{suffix}",
                            event_type="not_allowlisted",
                        ),
                    ]
                },
                headers=service_headers,
            )
            expect(partial, 207, "partial batch result")
            assert partial.json()["accepted_count"] == partial.json()["failed_count"] == 1
            wait_for_counts(project_id, (3, 3, 6, 1))

            cross_scope = client.post(
                f"/v1/projects/{project_id}/environments/{sibling_environment_id}/events:collect",
                json={"events": [exposure]},
                headers=service_headers,
            )
            expect(cross_scope, 403, "cross-environment event denial")

        settings = Settings(
            EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.LOCAL,
            AUTH_MODE=AuthMode.LOCAL,
            DATABASE_URL=SQLALCHEMY_DATABASE_URL,
            CREDENTIAL_PEPPER="local-compose-pepper-not-for-managed-use-0001",
        )
        engine = create_database_engine(settings.database_url)
        session_factory = create_session_factory(engine)
        crash_event = EventItem.model_validate(
            event(
                assignment_body,
                event_id=f"crash-transaction-{suffix}",
                event_type="exposure",
            )
        )
        delivery = QueueDelivery(
            f"crash-delivery-{suffix}",
            "direct-verification",
            1,
            event_envelope(crash_event, project_id=project_id, environment_id=environment_id),
        )
        try:
            with session_factory() as session:
                process_delivery(
                    session,
                    delivery=delivery,
                    settings=settings,
                    crash_point="before_commit",
                )
        except InjectedWorkerCrash:
            pass
        wait_for_counts(project_id, (3, 3, 6, 1))
        try:
            with session_factory() as session:
                process_delivery(
                    session,
                    delivery=delivery,
                    settings=settings,
                    crash_point="after_commit",
                )
        except InjectedWorkerCrash:
            pass
        with session_factory() as session:
            assert (
                process_delivery(session, delivery=delivery, settings=settings)
                is ProcessingResult.DUPLICATE
            )
            assert (
                replay_raw_events(
                    session,
                    environment_id=environment_id,
                    derivation_version=f"events-v2-{suffix}",
                )
                == 4
            )
            assert (
                replay_raw_events(
                    session,
                    environment_id=environment_id,
                    derivation_version=f"events-v2-{suffix}",
                )
                == 0
            )
        wait_for_counts(project_id, (4, 8, 7, 1))
        engine.dispose()
    finally:
        with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
            for query in PROJECT_CLEANUP_QUERIES:
                cursor.execute(query, (project_id,))
            cursor.execute(
                "DELETE FROM audit_records WHERE organization_id = %s",
                (organization_id,),
            )
            cursor.execute("DELETE FROM service_credentials WHERE project_id = %s", (project_id,))
            if experiment_id is not None:
                cursor.execute(
                    """
                    UPDATE experiments
                    SET active_configuration_version_id = NULL, active_analysis_plan_id = NULL
                    WHERE id = %s
                    """,
                    (experiment_id,),
                )
                cursor.execute(
                    "DELETE FROM configuration_versions WHERE experiment_id = %s",
                    (experiment_id,),
                )
                cursor.execute(
                    "DELETE FROM analysis_plans WHERE experiment_id = %s",
                    (experiment_id,),
                )
                cursor.execute("DELETE FROM experiments WHERE id = %s", (experiment_id,))
            cursor.execute("DELETE FROM environments WHERE project_id = %s", (project_id,))
            cursor.execute("DELETE FROM projects WHERE id = %s", (project_id,))
            cursor.execute("DELETE FROM organizations WHERE id = %s", (organization_id,))
    print("Day 3 local SQS, PostgreSQL, idempotency, crash, and replay verification passed.")


if __name__ == "__main__":
    main()
