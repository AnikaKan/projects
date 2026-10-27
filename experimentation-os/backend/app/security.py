import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from typing import cast

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import AuthMode, Settings
from app.db.models import OperatorMembership, OperatorRole, ServiceCredential

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    subject: str
    organization_id: uuid.UUID
    role: OperatorRole


@dataclass(frozen=True)
class ServicePrincipal:
    credential_id: uuid.UUID
    project_id: uuid.UUID
    environment_id: uuid.UUID
    capabilities: frozenset[str]


def settings_from_request(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def session_from_request(request: Request):  # type: ignore[no-untyped-def]
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def _local_principal(request: Request) -> Principal:
    subject = request.headers.get("X-Local-Subject")
    organization = request.headers.get("X-Local-Organization-ID")
    role = request.headers.get("X-Local-Role")
    if not subject or not organization or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required"
        )
    try:
        return Principal(subject, uuid.UUID(organization), OperatorRole(role))
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid local identity"
        ) from exc


def _oidc_claims(token: str, settings: Settings) -> dict[str, object]:
    if not settings.oidc_jwks_url or not settings.oidc_issuer or not settings.oidc_audience:
        raise HTTPException(status_code=500, detail="OIDC is not configured")
    try:
        signing_key = PyJWKClient(settings.oidc_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.oidc_audience,
            issuer=settings.oidc_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid access token"
        ) from exc


def current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(session_from_request),
) -> Principal:
    settings = settings_from_request(request)
    if settings.auth_mode is AuthMode.LOCAL:
        return _local_principal(request)
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required"
        )
    claims = _oidc_claims(credentials.credentials, settings)
    subject = str(claims["sub"])
    membership = session.scalar(
        select(OperatorMembership).where(
            OperatorMembership.issuer == settings.oidc_issuer,
            OperatorMembership.subject == subject,
            OperatorMembership.active.is_(True),
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="membership required")
    return Principal(subject, membership.organization_id, membership.role)


def require_roles(*allowed: OperatorRole):  # type: ignore[no-untyped-def]
    def dependency(principal: Principal = Depends(current_principal)) -> Principal:
        if principal.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")
        return principal

    return dependency


def credential_digest(secret: str, pepper: str) -> bytes:
    return hmac.new(pepper.encode(), secret.encode(), hashlib.sha256).digest()


def create_service_secret(credential_id: uuid.UUID, pepper: str) -> tuple[str, bytes]:
    secret = secrets.token_urlsafe(32)
    token = f"eos_{credential_id.hex}.{secret}"
    return token, credential_digest(token, pepper)


def authenticate_service_credential(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(session_from_request),
) -> ServicePrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="service credential required"
        )
    token = credentials.credentials
    try:
        public_part = token.split(".", 1)[0]
        credential_id = uuid.UUID(hex=public_part.removeprefix("eos_"))
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service credential"
        ) from exc
    credential = session.get(ServiceCredential, credential_id)
    if credential is None or credential.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service credential"
        )
    supplied = credential_digest(token, settings_from_request(request).credential_pepper)
    if not hmac.compare_digest(supplied, credential.secret_digest):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service credential"
        )
    return ServicePrincipal(
        credential.id,
        credential.project_id,
        credential.environment_id,
        frozenset(credential.capabilities),
    )


def require_service_capability(capability: str):  # type: ignore[no-untyped-def]
    def dependency(
        principal: ServicePrincipal = Depends(authenticate_service_credential),
    ) -> ServicePrincipal:
        if capability not in principal.capabilities:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"service credential lacks {capability} capability",
            )
        return principal

    return dependency
