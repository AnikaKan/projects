import pytest
from pydantic import ValidationError

from app.config import AuthMode, RuntimeEnvironment, Settings
from tests.conftest import local_headers


def test_liveness_is_public(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = seeded_app
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "experimentos-api"}


def test_operator_endpoint_denies_missing_identity(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = seeded_app
    assert client.get("/v1/me").status_code == 401


def test_local_auth_is_rejected_in_production() -> None:
    with pytest.raises(ValidationError, match="local authentication is forbidden"):
        Settings(
            EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.PRODUCTION,
            AUTH_MODE=AuthMode.LOCAL,
            CREDENTIAL_PEPPER="a-production-shaped-pepper-value-000000",
        )


def test_scope_is_visible_to_its_organization(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    response = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}",
        headers=local_headers(ids),
    )
    assert response.status_code == 200
    assert response.json()["environment_key"] == "staging"


def test_cross_organization_scope_is_hidden(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    response = client.get(
        f"/v1/projects/{ids['other_project']}/environments/{ids['other_environment']}",
        headers=local_headers(ids),
    )
    assert response.status_code == 404


def test_environment_cannot_be_mixed_with_another_project(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    response = client.get(
        f"/v1/projects/{ids['project']}/environments/{ids['other_environment']}",
        headers=local_headers(ids),
    )
    assert response.status_code == 404
