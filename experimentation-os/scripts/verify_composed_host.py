"""Verify that the composed host renders real server-side assignments without leakage."""

from __future__ import annotations

import os
import subprocess
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
API_URL = os.environ.get("EXPERIMENTOS_API_URL", "http://localhost:8000")
HOST_URL = os.environ.get("EXPERIMENTOS_HOST_URL", "http://localhost:3100")
DATABASE_URL = os.environ.get(
    "EXPERIMENTOS_COMPOSE_DATABASE_URL",
    "postgresql://experimentos:experimentos@localhost:5432/experimentos",
)
DOCKER_BIN = os.environ.get(
    "EXPERIMENTOS_DOCKER_BIN",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
)
DOCKER_HELPERS = str(Path(DOCKER_BIN).parent)
ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
PROJECT_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")
ENVIRONMENT_ID = uuid.UUID("00000000-0000-4000-8000-000000000003")


def headers(role: str) -> dict[str, str]:
    return {
        "X-Local-Subject": "host-compose-verifier@example.test",
        "X-Local-Organization-ID": str(ORGANIZATION_ID),
        "X-Local-Role": role,
    }


def expect(response: httpx.Response, status_code: int, label: str) -> None:
    if response.status_code != status_code:
        raise AssertionError(
            f"{label}: expected {status_code}, got {response.status_code}: {response.text[:300]}"
        )


def recreate_host(secret: str, experiment_key: str, subject_id: str) -> None:
    process_environment = {
        **os.environ,
        "PATH": f"{DOCKER_HELPERS}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "EXPERIMENTOS_SERVICE_CREDENTIAL": secret,
        "EXPERIMENTOS_EXPERIMENT_KEY": experiment_key,
        "DEMO_SUBJECT_ID": subject_id,
        "DEMO_MARKET": "US",
    }
    completed = subprocess.run(  # noqa: S603 -- executable is an explicit Docker path
        [
            DOCKER_BIN,
            "compose",
            "up",
            "-d",
            "--no-deps",
            "--force-recreate",
            "host-app",
        ],
        cwd=ROOT,
        env=process_environment,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"host recreation failed: {completed.stderr[-500:]}")


def read_host() -> str:
    last_error: Exception | None = None
    for _ in range(30):
        try:
            response = httpx.get(HOST_URL, timeout=5)
            if response.status_code == 200:
                return response.text
        except httpx.HTTPError as exc:
            last_error = exc
        time.sleep(1)
    raise RuntimeError(f"host did not become ready: {last_error}")


def wait_for_host_events(experiment_id: uuid.UUID) -> dict[str, int]:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT event_type, count(*)
                FROM raw_events
                WHERE experiment_id = %s
                GROUP BY event_type
                """,
                (experiment_id,),
            )
            counts = dict(cursor.fetchall())
        if counts.get("exposure", 0) >= 2 and counts.get("completed_signup", 0) >= 1:
            return counts
        time.sleep(0.25)
    raise AssertionError("timed out waiting for composed host exposure and outcome events")


def main() -> None:
    experiment_id: uuid.UUID | None = None
    credential_id: uuid.UUID | None = None
    suffix = uuid.uuid4().hex[:10]
    experiment_key = f"host-{suffix}"
    base = f"/v1/projects/{PROJECT_ID}/environments/{ENVIRONMENT_ID}/experiments"
    document = {
        "key": experiment_key,
        "name": "Composed host verification",
        "configuration": {
            "identity_namespace": "host-verifier",
            "traffic_allocation_basis_points": 10_000,
            "salt": f"host-compose-verification-salt-{suffix}",
        },
        "analysis_plan": {
            "hypothesis": "Treatment changes the demonstration headline.",
            "primary_metric": {"key": "completed_signup"},
            "guardrail_metric": {"key": "crash"},
            "guardrail_harm_margin_percentage_points": 1,
            "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "followup_hours": 24,
            "arrival_lateness_hours": 24,
        },
    }
    try:
        with httpx.Client(base_url=API_URL, timeout=15) as client:
            created = client.post(base, json=document, headers=headers("editor"))
            expect(created, 201, "host experiment creation")
            experiment_id = uuid.UUID(created.json()["id"])
            expect(
                client.post(
                    f"{base}/{experiment_id}/approve",
                    json={"expected_version": 1},
                    headers=headers("approver"),
                ),
                200,
                "host experiment approval",
            )
            expect(
                client.post(
                    f"{base}/{experiment_id}/launch",
                    json={"expected_version": 2},
                    headers=headers("approver"),
                ),
                200,
                "host experiment launch",
            )
            credential = client.post(
                f"/v1/projects/{PROJECT_ID}/environments/{ENVIRONMENT_ID}/credentials",
                json={
                    "name": f"host-verifier-{suffix}",
                    "capabilities": ["assignment", "event_ingestion"],
                },
                headers=headers("administrator"),
            )
            expect(credential, 201, "host credential creation")
            credential_id = uuid.UUID(credential.json()["id"])
            secret = credential.json()["secret"]
            service_headers = {"Authorization": f"Bearer {secret}"}
            assignment_path = f"{base}/{experiment_key}/assignments/resolve"
            subjects: dict[str, str] = {}
            for index in range(100):
                subject_id = f"host-subject-{index}"
                assignment = client.post(
                    assignment_path,
                    json={"subject_id": subject_id, "attributes": {"market": "US"}},
                    headers=service_headers,
                )
                expect(assignment, 200, "host subject assignment")
                arm = assignment.json()["arm"]
                if arm is not None:
                    subjects.setdefault(arm, subject_id)
                if {"control", "treatment"} <= subjects.keys():
                    break
            assert {"control", "treatment"} <= subjects.keys()

            expected_headlines = {
                "control": "Learn what works for your customers.",
                "treatment": "Start making better product decisions.",
            }
            for arm, subject_id in subjects.items():
                recreate_host(secret, experiment_key, subject_id)
                html = read_host()
                assert f"Assigned to <strong>{arm}</strong>" in html
                assert expected_headlines[arm] in html
                assert "Exposure delivery: <strong>accepted</strong>" in html
                assert secret not in html

            outcome_response = httpx.post(
                f"{HOST_URL}/api/signup", follow_redirects=True, timeout=15
            )
            assert outcome_response.status_code == 200
            assert "Outcome delivery: <strong>accepted</strong>" in outcome_response.text
            assert secret not in outcome_response.text

            disabled = client.post(
                f"{base}/{experiment_id}/disable",
                json={"expected_version": 3, "reason": "host compose verification"},
                headers=headers("administrator"),
            )
            expect(disabled, 200, "host experiment disable")
            recreate_host(secret, experiment_key, subjects["treatment"])
            disabled_html = read_host()
            assert "Experiment state: <strong>disabled</strong>" in disabled_html
            assert "No control assignment was invented." in disabled_html
            assert secret not in disabled_html

            wait_for_host_events(experiment_id)
    finally:
        recreate_host("", "signup-message", "visitor-1001")
        if experiment_id is not None:
            with (
                psycopg.connect(DATABASE_URL) as connection,
                connection.cursor() as cursor,
            ):
                cursor.execute(
                    """
                    UPDATE experiments
                    SET active_configuration_version_id = NULL,
                        active_analysis_plan_id = NULL
                    WHERE id = %s
                    """,
                    (experiment_id,),
                )
                cursor.execute(
                    "DELETE FROM event_contributions WHERE experiment_id = %s",
                    (experiment_id,),
                )
                cursor.execute(
                    """
                    DELETE FROM event_receipts
                    WHERE event_id IN (
                        SELECT event_id FROM raw_events WHERE experiment_id = %s
                    )
                    """,
                    (experiment_id,),
                )
                cursor.execute(
                    """
                    DELETE FROM quarantined_events
                    WHERE event_id IN (
                        SELECT event_id FROM raw_events WHERE experiment_id = %s
                    )
                    """,
                    (experiment_id,),
                )
                cursor.execute("DELETE FROM raw_events WHERE experiment_id = %s", (experiment_id,))
                cursor.execute("DELETE FROM assignments WHERE experiment_id = %s", (experiment_id,))
                cursor.execute(
                    "DELETE FROM configuration_versions WHERE experiment_id = %s",
                    (experiment_id,),
                )
                cursor.execute(
                    "DELETE FROM analysis_plans WHERE experiment_id = %s",
                    (experiment_id,),
                )
                cursor.execute("DELETE FROM experiments WHERE id = %s", (experiment_id,))
                cursor.execute(
                    """
                    DELETE FROM audit_records
                    WHERE project_id = %s AND actor_id = 'host-compose-verifier@example.test'
                    """,
                    (PROJECT_ID,),
                )
                if credential_id is not None:
                    cursor.execute(
                        "DELETE FROM service_credentials WHERE id = %s",
                        (credential_id,),
                    )
    print("Composed host control, treatment, disable, and secret-isolation checks passed.")


if __name__ == "__main__":
    main()
