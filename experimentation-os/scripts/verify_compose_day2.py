"""Verify the Day 2 lifecycle and concurrent assignment through the composed stack."""

from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import httpx
import psycopg

API_URL = os.environ.get("EXPERIMENTOS_API_URL", "http://localhost:8000")
DATABASE_URL = os.environ.get(
    "EXPERIMENTOS_COMPOSE_DATABASE_URL",
    "postgresql://experimentos:experimentos@localhost:5432/experimentos",
)


def expect(response: httpx.Response, status_code: int, label: str) -> None:
    if response.status_code != status_code:
        raise AssertionError(
            f"{label}: expected {status_code}, got {response.status_code}: {response.text[:300]}"
        )


def operator_headers(organization_id: uuid.UUID, role: str) -> dict[str, str]:
    return {
        "X-Local-Subject": "day2-compose-verifier@example.test",
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def experiment_document(key: str, suffix: str) -> dict[str, object]:
    return {
        "key": key,
        "name": f"{key} experiment",
        "configuration": {
            "identity_namespace": "compose-visitor",
            "traffic_allocation_basis_points": 10_000,
            "salt": f"compose-assignment-salt-{suffix}-{key}",
            "eligibility": {"attribute": "market", "allowed_values": ["US"]},
        },
        "analysis_plan": {
            "hypothesis": "A clearer message increases completed signups.",
            "primary_metric": {"key": "completed_signup"},
            "guardrail_metric": {"key": "crash"},
            "guardrail_harm_margin_percentage_points": 1,
            "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "followup_hours": 24,
            "arrival_lateness_hours": 24,
        },
    }


def main() -> None:
    organization_id, project_id, environment_id, sibling_environment_id = [
        uuid.uuid4() for _ in range(4)
    ]
    suffix = organization_id.hex[:10]
    with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO organizations (id, name) VALUES (%s, %s)",
            (organization_id, f"Day 2 compose verification {suffix}"),
        )
        cursor.execute(
            "INSERT INTO projects (id, organization_id, key, name) VALUES (%s, %s, %s, %s)",
            (project_id, organization_id, f"day2-{suffix}", "Day 2 verification"),
        )
        cursor.execute(
            """
            INSERT INTO environments (id, project_id, key, name)
            VALUES (%s, %s, 'local', 'Local'), (%s, %s, 'sibling', 'Sibling')
            """,
            (environment_id, project_id, sibling_environment_id, project_id),
        )

    base = f"/v1/projects/{project_id}/environments/{environment_id}/experiments"
    editor = operator_headers(organization_id, "editor")
    approver = operator_headers(organization_id, "approver")
    administrator = operator_headers(organization_id, "administrator")
    viewer = operator_headers(organization_id, "viewer")
    try:
        with httpx.Client(base_url=API_URL, timeout=15) as client:
            first_document = experiment_document(f"first-{suffix}", suffix)
            expect(
                client.post(base, json=first_document, headers=viewer),
                403,
                "viewer draft creation",
            )
            created = client.post(base, json=first_document, headers=editor)
            expect(created, 201, "draft creation")
            first = created.json()

            revised_configuration = dict(first_document["configuration"])  # type: ignore[arg-type]
            revised_configuration["salt"] = f"revised-compose-assignment-salt-{suffix}"
            revised = client.put(
                f"{base}/{first['id']}",
                json={
                    "expected_version": 1,
                    "name": "Revised first experiment",
                    "configuration": revised_configuration,
                    "analysis_plan": first_document["analysis_plan"],
                },
                headers=editor,
            )
            expect(revised, 200, "draft revision")
            assert revised.json()["configuration_version"] == 2
            assert revised.json()["analysis_plan_version"] == 2

            approved = client.post(
                f"{base}/{first['id']}/approve",
                json={"expected_version": 2},
                headers=approver,
            )
            expect(approved, 200, "approval")
            immutable = client.put(
                f"{base}/{first['id']}",
                json={
                    "expected_version": 3,
                    "name": "Forbidden revision",
                    "configuration": revised_configuration,
                    "analysis_plan": first_document["analysis_plan"],
                },
                headers=editor,
            )
            expect(immutable, 409, "approved document immutability")
            launched = client.post(
                f"{base}/{first['id']}/launch",
                json={"expected_version": 3},
                headers=approver,
            )
            expect(launched, 200, "launch")

            second_document = experiment_document(f"second-{suffix}", suffix)
            second = client.post(base, json=second_document, headers=editor)
            expect(second, 201, "second draft creation")
            second_id = second.json()["id"]
            expect(
                client.post(
                    f"{base}/{second_id}/approve",
                    json={"expected_version": 1},
                    headers=approver,
                ),
                200,
                "second approval",
            )
            expect(
                client.post(
                    f"{base}/{second_id}/launch",
                    json={"expected_version": 2},
                    headers=approver,
                ),
                409,
                "one active experiment",
            )

            credential = client.post(
                f"/v1/projects/{project_id}/environments/{environment_id}/credentials",
                json={"name": f"day2-host-{suffix}", "capabilities": ["assignment"]},
                headers=administrator,
            )
            expect(credential, 201, "assignment credential creation")
            service_headers = {"Authorization": f"Bearer {credential.json()['secret']}"}
            assignment_path = f"{base}/{first_document['key']}/assignments/resolve"
            assignment_request = {
                "subject_id": "concurrent-subject",
                "attributes": {"market": "US"},
            }
            barrier = Barrier(2)

            def concurrent_assignment() -> httpx.Response:
                barrier.wait()
                return httpx.post(
                    f"{API_URL}{assignment_path}",
                    json=assignment_request,
                    headers=service_headers,
                    timeout=15,
                )

            with ThreadPoolExecutor(max_workers=2) as pool:
                concurrent = list(pool.map(lambda _: concurrent_assignment(), range(2)))
            for response in concurrent:
                expect(response, 200, "concurrent assignment")
                assert response.json()["state"] == "assigned"
            assignment_ids = {response.json()["assignment_id"] for response in concurrent}
            assert len(assignment_ids) == 1

            ineligible = client.post(
                assignment_path,
                json={"subject_id": "ineligible", "attributes": {"market": "FR"}},
                headers=service_headers,
            )
            expect(ineligible, 200, "ineligible assignment request")
            assert ineligible.json()["state"] == "ineligible"
            cross_scope_path = (
                f"/v1/projects/{project_id}/environments/{sibling_environment_id}"
                f"/experiments/{first_document['key']}/assignments/resolve"
            )
            expect(
                client.post(
                    cross_scope_path,
                    json=assignment_request,
                    headers=service_headers,
                ),
                403,
                "cross-environment credential denial",
            )

            closed = client.post(
                f"{base}/{first['id']}/close-enrollment",
                json={"expected_version": 4},
                headers=editor,
            )
            expect(closed, 200, "enrollment close")
            existing = client.post(
                assignment_path, json=assignment_request, headers=service_headers
            )
            expect(existing, 200, "existing assignment after enrollment close")
            assert existing.json()["assignment_id"] in assignment_ids
            blocked_new = client.post(
                assignment_path,
                json={"subject_id": "new-subject", "attributes": {"market": "US"}},
                headers=service_headers,
            )
            assert blocked_new.json()["state"] == "enrollment_closed"

            disabled = client.post(
                f"{base}/{first['id']}/disable",
                json={"expected_version": 5, "reason": "compose verification"},
                headers=administrator,
            )
            expect(disabled, 200, "emergency disable")
            disabled_assignment = client.post(
                assignment_path, json=assignment_request, headers=service_headers
            )
            assert disabled_assignment.json()["state"] == "disabled"

        with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM assignments WHERE project_id = %s",
                (project_id,),
            )
            assert cursor.fetchone() == (1,)
            cursor.execute(
                """
                SELECT count(*) FROM audit_records
                WHERE project_id = %s AND action LIKE 'experiment.%%'
                """,
                (project_id,),
            )
            audit_count = cursor.fetchone()
            assert audit_count is not None and audit_count[0] >= 6
    finally:
        with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE experiments
                SET active_configuration_version_id = NULL, active_analysis_plan_id = NULL
                WHERE project_id = %s
                """,
                (project_id,),
            )
            cursor.execute("DELETE FROM assignments WHERE project_id = %s", (project_id,))
            cursor.execute(
                "DELETE FROM audit_records WHERE organization_id = %s",
                (organization_id,),
            )
            cursor.execute("DELETE FROM service_credentials WHERE project_id = %s", (project_id,))
            cursor.execute(
                """
                DELETE FROM configuration_versions
                WHERE experiment_id IN (SELECT id FROM experiments WHERE project_id = %s)
                """,
                (project_id,),
            )
            cursor.execute(
                """
                DELETE FROM analysis_plans
                WHERE experiment_id IN (SELECT id FROM experiments WHERE project_id = %s)
                """,
                (project_id,),
            )
            cursor.execute("DELETE FROM experiments WHERE project_id = %s", (project_id,))
            cursor.execute("DELETE FROM environments WHERE project_id = %s", (project_id,))
            cursor.execute("DELETE FROM projects WHERE id = %s", (project_id,))
            cursor.execute("DELETE FROM organizations WHERE id = %s", (organization_id,))
    print("Day 2 composed PostgreSQL lifecycle and concurrency verification passed.")


if __name__ == "__main__":
    main()
