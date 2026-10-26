"""Verify Day 1 authorization boundaries through the composed API and PostgreSQL."""

from __future__ import annotations

import os
import uuid

import httpx
import psycopg

API_URL = os.environ.get("EXPERIMENTOS_API_URL", "http://localhost:8000")
DATABASE_URL = os.environ.get(
    "EXPERIMENTOS_COMPOSE_DATABASE_URL",
    "postgresql://experimentos:experimentos@localhost:5432/experimentos",
)


def expect(response: httpx.Response, status_code: int, label: str) -> None:
    if response.status_code != status_code:
        raise AssertionError(f"{label}: expected {status_code}, got {response.status_code}")


def operator_headers(organization_id: uuid.UUID, role: str) -> dict[str, str]:
    return {
        "X-Local-Subject": "compose-verifier@example.test",
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def main() -> None:
    organization_id = uuid.uuid4()
    other_organization_id = uuid.uuid4()
    project_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    sibling_environment_id = uuid.uuid4()
    other_environment_id = uuid.uuid4()
    suffix = organization_id.hex[:10]

    with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO organizations (id, name) VALUES (%s, %s), (%s, %s)",
            (
                organization_id,
                f"Compose verification {suffix}",
                other_organization_id,
                f"Other compose verification {suffix}",
            ),
        )
        cursor.execute(
            """
                INSERT INTO projects (id, organization_id, key, name)
                VALUES (%s, %s, %s, %s), (%s, %s, %s, %s)
                """,
            (
                project_id,
                organization_id,
                f"compose-{suffix}",
                "Compose project",
                other_project_id,
                other_organization_id,
                f"other-compose-{suffix}",
                "Other compose project",
            ),
        )
        cursor.execute(
            """
                INSERT INTO environments (id, project_id, key, name)
                VALUES (%s, %s, 'staging', 'Staging'),
                       (%s, %s, 'production', 'Production'),
                       (%s, %s, 'staging', 'Other staging')
                """,
            (
                environment_id,
                project_id,
                sibling_environment_id,
                project_id,
                other_environment_id,
                other_project_id,
            ),
        )

    try:
        with httpx.Client(base_url=API_URL, timeout=10) as client:
            expect(client.get("/v1/me"), 401, "missing operator identity")

            viewer_headers = operator_headers(organization_id, "viewer")
            administrator_headers = operator_headers(organization_id, "administrator")
            credential_path = f"/v1/projects/{project_id}/environments/{environment_id}/credentials"

            expect(
                client.post(
                    credential_path,
                    headers=viewer_headers,
                    json={"name": "viewer-denied", "capabilities": ["assignment"]},
                ),
                403,
                "viewer credential creation",
            )
            expect(
                client.get(
                    f"/v1/projects/{project_id}/environments/{environment_id}",
                    headers=viewer_headers,
                ),
                200,
                "same-organization scope",
            )
            expect(
                client.get(
                    f"/v1/projects/{other_project_id}/environments/{other_environment_id}",
                    headers=viewer_headers,
                ),
                404,
                "cross-organization scope",
            )
            expect(
                client.get(
                    f"/v1/projects/{project_id}/environments/{other_environment_id}",
                    headers=viewer_headers,
                ),
                404,
                "mixed project/environment scope",
            )

            created_response = client.post(
                credential_path,
                headers=administrator_headers,
                json={
                    "name": f"compose-host-{suffix}",
                    "capabilities": ["assignment", "event_ingestion"],
                },
            )
            expect(created_response, 201, "administrator credential creation")
            created = created_response.json()
            credential_id = uuid.UUID(created["id"])
            secret = created["secret"]

            with (
                psycopg.connect(DATABASE_URL) as connection,
                connection.cursor() as cursor,
            ):
                cursor.execute(
                    "SELECT secret_digest FROM service_credentials WHERE id = %s",
                    (credential_id,),
                )
                stored_digest = cursor.fetchone()
                assert stored_digest is not None
                assert secret.encode() != bytes(stored_digest[0])
                cursor.execute(
                    """
                    SELECT count(*) FROM audit_records
                    WHERE action = 'service_credential.created'
                      AND environment_id = %s
                    """,
                    (environment_id,),
                )
                assert cursor.fetchone() == (1,)

            service_headers = {"Authorization": f"Bearer {secret}"}
            expect(
                client.get(
                    f"/v1/projects/{project_id}/environments/{environment_id}/service-context",
                    headers=service_headers,
                ),
                200,
                "credential in its environment",
            )
            expect(
                client.get(
                    f"/v1/projects/{project_id}/environments/{sibling_environment_id}/service-context",
                    headers=service_headers,
                ),
                403,
                "credential in a sibling environment",
            )

            revoke_path = f"{credential_path}/{credential_id}"
            expect(
                client.delete(revoke_path, headers=administrator_headers),
                200,
                "credential revocation",
            )
            expect(
                client.get(
                    f"/v1/projects/{project_id}/environments/{environment_id}/service-context",
                    headers=service_headers,
                ),
                401,
                "revoked credential",
            )
    finally:
        with (
            psycopg.connect(DATABASE_URL) as connection,
            connection.cursor() as cursor,
        ):
            cursor.execute(
                "DELETE FROM audit_records WHERE organization_id IN (%s, %s)",
                (organization_id, other_organization_id),
            )
            cursor.execute(
                "DELETE FROM service_credentials WHERE project_id IN (%s, %s)",
                (project_id, other_project_id),
            )
            cursor.execute(
                "DELETE FROM environments WHERE project_id IN (%s, %s)",
                (project_id, other_project_id),
            )
            cursor.execute(
                "DELETE FROM projects WHERE id IN (%s, %s)",
                (project_id, other_project_id),
            )
            cursor.execute(
                "DELETE FROM organizations WHERE id IN (%s, %s)",
                (organization_id, other_organization_id),
            )

    print("compose security verification passed")


if __name__ == "__main__":
    main()
