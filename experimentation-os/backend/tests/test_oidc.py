from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.config import AuthMode, RuntimeEnvironment, Settings
from app.db.models import OperatorMembership, OperatorRole
from app.security import _oidc_claims


def oidc_settings() -> Settings:
    return Settings(
        EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.TEST,
        AUTH_MODE=AuthMode.OIDC,
        DATABASE_URL="sqlite://",
        CREDENTIAL_PEPPER="oidc-test-credential-pepper-0000000000",
        OIDC_ISSUER="https://identity.example.test",
        OIDC_AUDIENCE="experimentos",
        OIDC_JWKS_URL="https://identity.example.test/.well-known/jwks.json",
    )


def test_oidc_verifies_signature_issuer_audience_and_time(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = oidc_settings()
    private_key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "operator-123",
            "iss": settings.oidc_issuer,
            "aud": settings.oidc_audience,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )

    class FakeJwkClient:
        def __init__(self, url: str) -> None:
            assert url == settings.oidc_jwks_url

        def get_signing_key_from_jwt(self, raw_token: str):  # type: ignore[no-untyped-def]
            assert raw_token == token
            return SimpleNamespace(key=private_key.public_key())

    monkeypatch.setattr("app.security.PyJWKClient", FakeJwkClient)
    claims = _oidc_claims(token, settings)
    assert claims["sub"] == "operator-123"


def test_oidc_rejects_wrong_audience(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = oidc_settings()
    private_key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "operator-123",
            "iss": settings.oidc_issuer,
            "aud": "another-service",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
    )

    class FakeJwkClient:
        def __init__(self, _url: str) -> None:
            pass

        def get_signing_key_from_jwt(self, _raw_token: str):  # type: ignore[no-untyped-def]
            return SimpleNamespace(key=private_key.public_key())

    monkeypatch.setattr("app.security.PyJWKClient", FakeJwkClient)
    with pytest.raises(HTTPException) as error:
        _oidc_claims(token, settings)
    assert error.value.status_code == 401


def test_oidc_membership_supplies_server_enforced_role(seeded_app, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    settings = oidc_settings()
    client.app.state.settings = settings
    with session_factory() as session:
        session.add(
            OperatorMembership(
                organization_id=ids["organization"],
                issuer=settings.oidc_issuer,
                subject="oidc-viewer",
                role=OperatorRole.VIEWER,
                active=True,
            )
        )
        session.commit()

    monkeypatch.setattr(
        "app.security._oidc_claims", lambda _token, _settings: {"sub": "oidc-viewer"}
    )
    headers = {"Authorization": "Bearer signed-test-token"}
    identity = client.get("/v1/me", headers=headers)
    assert identity.status_code == 200
    assert identity.json()["role"] == "viewer"

    forbidden = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials",
        headers=headers,
        json={"name": "host", "capabilities": ["assignment"]},
    )
    assert forbidden.status_code == 403


def test_oidc_denies_valid_token_without_membership(seeded_app, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = seeded_app
    client.app.state.settings = oidc_settings()
    monkeypatch.setattr(
        "app.security._oidc_claims", lambda _token, _settings: {"sub": "not-a-member"}
    )
    response = client.get("/v1/me", headers={"Authorization": "Bearer signed-test-token"})
    assert response.status_code == 403
