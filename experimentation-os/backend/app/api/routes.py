import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AuditRecord,
    Environment,
    OperatorRole,
    Project,
    ServiceCredential,
)
from app.schemas import (
    CredentialCreateRequest,
    CredentialCreateResponse,
    CredentialResponse,
    HealthResponse,
    PrincipalResponse,
    ScopeResponse,
    ServiceContextResponse,
)
from app.security import (
    Principal,
    ServicePrincipal,
    authenticate_service_credential,
    create_service_secret,
    current_principal,
    require_roles,
    session_from_request,
    settings_from_request,
)

router = APIRouter()


def scoped_environment(
    session: Session,
    principal: Principal,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
) -> tuple[Project, Environment]:
    row = session.execute(
        select(Project, Environment)
        .join(Environment, Environment.project_id == Project.id)
        .where(
            Project.id == project_id,
            Project.organization_id == principal.organization_id,
            Environment.id == environment_id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scope not found")
    return row[0], row[1]


@router.get("/health/live", response_model=HealthResponse, tags=["health"])
def live() -> HealthResponse:
    return HealthResponse()


@router.get("/health/ready", response_model=HealthResponse, tags=["health"])
def ready(session: Session = Depends(session_from_request)) -> HealthResponse:
    session.execute(select(1)).scalar_one()
    return HealthResponse()


@router.get("/v1/me", response_model=PrincipalResponse, tags=["operators"])
def me(principal: Principal = Depends(current_principal)) -> PrincipalResponse:
    return PrincipalResponse(
        subject=principal.subject,
        organization_id=principal.organization_id,
        role=principal.role.value,
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}",
    response_model=ScopeResponse,
    tags=["operators"],
)
def read_scope(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> ScopeResponse:
    project, environment = scoped_environment(session, principal, project_id, environment_id)
    return ScopeResponse(
        project_id=project.id,
        project_key=project.key,
        environment_id=environment.id,
        environment_key=environment.key,
    )


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/credentials",
    response_model=CredentialCreateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["credentials"],
)
def create_credential(
    request: Request,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    payload: CredentialCreateRequest,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> CredentialCreateResponse:
    scoped_environment(session, principal, project_id, environment_id)
    credential_id = uuid.uuid4()
    secret, digest = create_service_secret(
        credential_id, settings_from_request(request).credential_pepper
    )
    capabilities = sorted({item.value for item in payload.capabilities})
    credential = ServiceCredential(
        id=credential_id,
        project_id=project_id,
        environment_id=environment_id,
        name=payload.name,
        secret_digest=digest,
        capabilities=capabilities,
        created_by_subject=principal.subject,
    )
    session.add(credential)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="service_credential.created",
            detail={"credential_id": str(credential_id), "capabilities": capabilities},
        )
    )
    session.commit()
    return CredentialCreateResponse(
        id=credential.id,
        name=credential.name,
        secret=secret,
        capabilities=credential.capabilities,
    )


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/credentials/{credential_id}/rotate",
    response_model=CredentialCreateResponse,
    tags=["credentials"],
)
def rotate_credential(
    request: Request,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    credential_id: uuid.UUID,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> CredentialCreateResponse:
    scoped_environment(session, principal, project_id, environment_id)
    previous = session.scalar(
        select(ServiceCredential).where(
            ServiceCredential.id == credential_id,
            ServiceCredential.project_id == project_id,
            ServiceCredential.environment_id == environment_id,
            ServiceCredential.revoked_at.is_(None),
        )
    )
    if previous is None:
        raise HTTPException(status_code=404, detail="credential not found")
    now = datetime.now(UTC)
    previous.revoked_at = now
    replacement_id = uuid.uuid4()
    secret, digest = create_service_secret(
        replacement_id, settings_from_request(request).credential_pepper
    )
    replacement = ServiceCredential(
        id=replacement_id,
        project_id=project_id,
        environment_id=environment_id,
        name=f"{previous.name}-{replacement_id.hex[:8]}",
        secret_digest=digest,
        capabilities=previous.capabilities,
        created_by_subject=principal.subject,
        rotated_from_id=previous.id,
    )
    session.add(replacement)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="service_credential.rotated",
            detail={"old_id": str(previous.id), "new_id": str(replacement.id)},
        )
    )
    session.commit()
    return CredentialCreateResponse(
        id=replacement.id,
        name=replacement.name,
        secret=secret,
        capabilities=replacement.capabilities,
    )


@router.delete(
    "/v1/projects/{project_id}/environments/{environment_id}/credentials/{credential_id}",
    response_model=CredentialResponse,
    tags=["credentials"],
)
def revoke_credential(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    credential_id: uuid.UUID,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> CredentialResponse:
    scoped_environment(session, principal, project_id, environment_id)
    credential = session.scalar(
        select(ServiceCredential).where(
            ServiceCredential.id == credential_id,
            ServiceCredential.project_id == project_id,
            ServiceCredential.environment_id == environment_id,
        )
    )
    if credential is None:
        raise HTTPException(status_code=404, detail="credential not found")
    credential.revoked_at = datetime.now(UTC)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="service_credential.revoked",
            detail={"credential_id": str(credential.id)},
        )
    )
    session.commit()
    return CredentialResponse(
        id=credential.id,
        name=credential.name,
        capabilities=credential.capabilities,
        revoked=True,
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/service-context",
    response_model=ServiceContextResponse,
    tags=["service-auth"],
)
def service_context(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    principal: ServicePrincipal = Depends(authenticate_service_credential),
) -> ServiceContextResponse:
    if principal.project_id != project_id or principal.environment_id != environment_id:
        raise HTTPException(status_code=403, detail="credential scope mismatch")
    return ServiceContextResponse(
        credential_id=principal.credential_id,
        project_id=principal.project_id,
        environment_id=principal.environment_id,
        capabilities=sorted(principal.capabilities),
    )
