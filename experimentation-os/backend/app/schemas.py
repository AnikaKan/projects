import uuid
from enum import StrEnum

from pydantic import BaseModel, Field


class Capability(StrEnum):
    ASSIGNMENT = "assignment"
    EVENT_INGESTION = "event_ingestion"


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "experimentos-api"


class PrincipalResponse(BaseModel):
    subject: str
    organization_id: uuid.UUID
    role: str


class ScopeResponse(BaseModel):
    project_id: uuid.UUID
    project_key: str
    environment_id: uuid.UUID
    environment_key: str


class CredentialCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capabilities: list[Capability] = Field(min_length=1)


class CredentialCreateResponse(BaseModel):
    id: uuid.UUID
    name: str
    secret: str
    capabilities: list[str]


class CredentialResponse(BaseModel):
    id: uuid.UUID
    name: str
    capabilities: list[str]
    revoked: bool


class ServiceContextResponse(BaseModel):
    credential_id: uuid.UUID
    project_id: uuid.UUID
    environment_id: uuid.UUID
    capabilities: list[str]
