import uuid

from sqlalchemy import select

from app.db.models import AuditRecord, ServiceCredential
from tests.conftest import local_headers


def test_viewer_cannot_create_service_credential(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    response = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials",
        headers=local_headers(ids, "viewer"),
        json={"name": "host", "capabilities": ["assignment"]},
    )
    assert response.status_code == 403


def test_scoped_credential_is_hashed_audited_and_revocable(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    create_response = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials",
        headers=local_headers(ids, "administrator"),
        json={"name": "host", "capabilities": ["assignment", "event_ingestion"]},
    )
    assert create_response.status_code == 201
    created = create_response.json()
    secret = created["secret"]
    assert secret.startswith("eos_")

    with session_factory() as session:
        stored = session.get(ServiceCredential, uuid.UUID(created["id"]))
        assert stored is not None
        assert secret.encode() != stored.secret_digest
        audit = session.scalar(
            select(AuditRecord).where(AuditRecord.action == "service_credential.created")
        )
        assert audit is not None

    allowed = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/service-context",
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert allowed.status_code == 200

    wrong_environment = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}/service-context",
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert wrong_environment.status_code == 403

    revoked = client.delete(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials/{created['id']}",
        headers=local_headers(ids, "administrator"),
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] is True

    denied = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/service-context",
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert denied.status_code == 401


def test_rotation_revokes_old_secret_and_returns_new_secret_once(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    created = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials",
        headers=local_headers(ids, "administrator"),
        json={"name": "collector", "capabilities": ["event_ingestion"]},
    ).json()
    rotated_response = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials/{created['id']}/rotate",
        headers=local_headers(ids, "administrator"),
    )
    assert rotated_response.status_code == 200
    rotated = rotated_response.json()
    assert rotated["id"] != created["id"]
    assert rotated["secret"] != created["secret"]

    old_response = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/service-context",
        headers={"Authorization": f"Bearer {created['secret']}"},
    )
    new_response = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/service-context",
        headers={"Authorization": f"Bearer {rotated['secret']}"},
    )
    assert old_response.status_code == 401
    assert new_response.status_code == 200
