import json
import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class Capability(StrEnum):
    ASSIGNMENT = "assignment"
    EVENT_INGESTION = "event_ingestion"


class AssignmentState(StrEnum):
    ASSIGNED = "assigned"
    INELIGIBLE = "ineligible"
    OUT_OF_TRAFFIC = "out_of_traffic"
    NOT_RUNNING = "not_running"
    ENROLLMENT_CLOSED = "enrollment_closed"
    DISABLED = "disabled"


class ArmDefinition(BaseModel):
    key: Literal["control", "treatment"]
    allocation_basis_points: Literal[5000] = 5000


class EligibilityRule(BaseModel):
    attribute: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_]*$")
    allowed_values: list[str] = Field(min_length=1, max_length=50)

    @field_validator("allowed_values")
    @classmethod
    def normalize_allowed_values(cls, values: list[str]) -> list[str]:
        normalized = sorted({value.strip() for value in values if value.strip()})
        if not normalized or any(len(value) > 120 for value in normalized):
            raise ValueError("eligibility values must be non-empty and at most 120 characters")
        return normalized


class AssignmentConfiguration(BaseModel):
    identity_namespace: str = Field(min_length=1, max_length=120)
    traffic_allocation_basis_points: int = Field(ge=0, le=10_000)
    salt: str = Field(min_length=16, max_length=160)
    algorithm_version: Literal["sha256-v1"] = "sha256-v1"
    arms: list[ArmDefinition] = Field(
        default_factory=lambda: [
            ArmDefinition(key="control"),
            ArmDefinition(key="treatment"),
        ]
    )
    eligibility: EligibilityRule | None = None
    safe_fallback: Literal["unavailable"] = "unavailable"

    @model_validator(mode="after")
    def validate_fixed_arms(self) -> "AssignmentConfiguration":
        if [arm.key for arm in self.arms] != ["control", "treatment"]:
            raise ValueError("the initial contract requires control and treatment arms in order")
        return self


class MetricDefinition(BaseModel):
    key: str = Field(min_length=1, max_length=120, pattern=r"^[a-z][a-z0-9_]*$")
    kind: Literal["binary"] = "binary"


class AnalysisPlanDocument(BaseModel):
    hypothesis: str = Field(min_length=1, max_length=1000)
    primary_metric: MetricDefinition
    guardrail_metric: MetricDefinition
    guardrail_harm_margin_percentage_points: float = Field(gt=0, le=100)
    enrollment_ends_at: datetime
    followup_hours: int = Field(ge=1, le=24 * 90)
    arrival_lateness_hours: int = Field(ge=0, le=24 * 30)
    primary_alpha: float = Field(default=0.05, ge=0.05, le=0.05)
    baseline_rate: float | None = Field(default=None, gt=0, lt=1)
    guardrail_baseline_rate: float | None = Field(default=None, gt=0, lt=1)
    minimum_detectable_effect_percentage_points: float | None = Field(default=None, gt=0, le=100)
    desired_power: float | None = Field(default=None, gt=0.5, lt=1)
    practical_significance_threshold_percentage_points: float | None = Field(
        default=None, ge=0, le=100
    )
    practical_threshold_semantics: Literal["lower_confidence_bound_above"] | None = None
    primary_test_method: Literal["score"] | None = None
    primary_interval_method: Literal["score"] | None = None
    score_correction: bool | None = None
    guardrail_one_sided_alpha: float | None = Field(default=None, gt=0, le=0.05)

    @field_validator("enrollment_ends_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("enrollment_ends_at must include a timezone")
        return value


class ExperimentCreateRequest(BaseModel):
    key: str = Field(min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9-]*$")
    name: str = Field(min_length=1, max_length=200)
    configuration: AssignmentConfiguration
    analysis_plan: AnalysisPlanDocument


class ExperimentDraftUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=200)
    configuration: AssignmentConfiguration
    analysis_plan: AnalysisPlanDocument


class ExperimentTransitionRequest(BaseModel):
    expected_version: int = Field(ge=1)


class EmergencyDisableRequest(ExperimentTransitionRequest):
    reason: str = Field(min_length=1, max_length=500)


class ExperimentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    environment_id: uuid.UUID
    key: str
    name: str
    owner_subject: str
    status: str
    version: int
    configuration_version_id: uuid.UUID
    configuration_version: int
    configuration_digest: str
    configuration: AssignmentConfiguration
    analysis_plan_id: uuid.UUID
    analysis_plan_version: int
    analysis_plan_digest: str
    analysis_plan: AnalysisPlanDocument


class AssignmentResolveRequest(BaseModel):
    subject_id: str = Field(min_length=1, max_length=255)
    attributes: dict[str, str] = Field(default_factory=dict)

    @field_validator("attributes")
    @classmethod
    def validate_attributes(cls, values: dict[str, str]) -> dict[str, str]:
        if len(values) > 20:
            raise ValueError("at most 20 eligibility attributes are accepted")
        for key, value in values.items():
            if not key or len(key) > 80 or len(value) > 120:
                raise ValueError("eligibility attribute keys and values are bounded")
        return values


class AssignmentResponse(BaseModel):
    state: AssignmentState
    experiment_id: uuid.UUID | None = None
    configuration_version_id: uuid.UUID | None = None
    assignment_id: uuid.UUID | None = None
    arm: Literal["control", "treatment"] | None = None
    assignment_token: str | None = None
    existing: bool = False
    reason: str | None = None


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "experimentos-api"
    release_version: str


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


class EventItem(BaseModel):
    event_id: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    schema_version: Literal["1"] = "1"
    assignment_id: uuid.UUID
    assignment_token: str = Field(min_length=40, max_length=2000)
    event_type: str = Field(min_length=1, max_length=120, pattern=r"^[a-z][a-z0-9_]*$")
    occurred_at: datetime
    source_identity: str = Field(min_length=1, max_length=255)
    correlation_id: str = Field(min_length=1, max_length=160)
    payload: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("occurred_at")
    @classmethod
    def require_event_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must include a timezone")
        return value

    @field_validator("payload")
    @classmethod
    def bound_event_payload(
        cls, value: dict[str, str | int | float | bool | None]
    ) -> dict[str, str | int | float | bool | None]:
        if len(value) > 20:
            raise ValueError("event payload accepts at most 20 fields")
        if any(not key or len(key) > 80 for key in value):
            raise ValueError("event payload keys must be non-empty and at most 80 characters")
        if any(isinstance(item, str) and len(item) > 500 for item in value.values()):
            raise ValueError("event payload string values are limited to 500 characters")
        if len(json.dumps(value, separators=(",", ":")).encode()) > 8_192:
            raise ValueError("event payload is limited to 8192 bytes")
        return value


class EventBatchRequest(BaseModel):
    events: list[EventItem] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_event_ids(self) -> "EventBatchRequest":
        ids = [event.event_id for event in self.events]
        if len(ids) != len(set(ids)):
            raise ValueError("event IDs must be unique within a batch")
        return self


class EventItemResult(BaseModel):
    event_id: str
    accepted: bool
    status_code: int
    queue_message_id: str | None = None
    reason: str | None = None


class EventBatchResponse(BaseModel):
    accepted_count: int
    failed_count: int
    results: list[EventItemResult]


class CohortDeriveRequest(BaseModel):
    derivation_version: str = Field(
        default="cohort-v1", min_length=8, max_length=40, pattern=r"^cohort-[A-Za-z0-9._-]+$"
    )
    event_derivation_version: str = Field(
        default="events-v1", min_length=8, max_length=40, pattern=r"^events-[A-Za-z0-9._-]+$"
    )


class CohortSnapshotResponse(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    configuration_version_id: uuid.UUID
    analysis_plan_id: uuid.UUID
    derivation_version: str
    event_derivation_version: str
    evaluated_at: datetime
    arrival_cutoff_at: datetime
    source_counts: dict[str, int]
    arm_counts: dict[str, dict[str, int]]
    checks: dict[str, Any]
    readiness: dict[str, bool]
    finalization_ready: bool
    created: bool = False


class AnalysisDeriveRequest(BaseModel):
    cohort_snapshot_id: uuid.UUID
    analysis_version: str = Field(
        min_length=10, max_length=40, pattern=r"^analysis-[A-Za-z0-9._-]+$"
    )


class AnalysisSnapshotResponse(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    configuration_version_id: uuid.UUID
    analysis_plan_id: uuid.UUID
    cohort_snapshot_id: uuid.UUID
    analysis_version: str
    derivation_version: str
    code_version: str
    image_version: str
    library_versions: dict[str, str]
    cutoff_at: datetime
    source_counts: dict[str, Any]
    checks: dict[str, Any]
    results: dict[str, Any]
    recommendation: Literal[
        "eligible_for_human_approval",
        "do_not_launch",
        "inconclusive",
    ]
    finalized_at: datetime
    invalidated_at: datetime | None
    created: bool = False


class DecisionCreateRequest(BaseModel):
    action: Literal["approve_launch", "reject_launch", "request_new_experiment"]
    rationale: str = Field(min_length=10, max_length=2000)
    rollout_reference: str | None = Field(default=None, min_length=3, max_length=500)

    @model_validator(mode="after")
    def launch_approval_requires_reference(self) -> "DecisionCreateRequest":
        if self.action == "approve_launch" and not self.rollout_reference:
            raise ValueError("approve_launch requires an external rollout reference")
        return self


class DecisionResponse(BaseModel):
    id: uuid.UUID
    snapshot_id: uuid.UUID
    actor_subject: str
    action: str
    rationale: str
    rollout_reference: str | None
    created_at: datetime


class SnapshotInvalidationRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)


class AuditRecordResponse(BaseModel):
    id: uuid.UUID
    actor_type: str
    actor_id: str
    action: str
    detail: dict[str, Any]
    occurred_at: datetime


class AlertTestRequest(BaseModel):
    recipient_label: str = Field(min_length=3, max_length=160)


class OperationalAlertResponse(BaseModel):
    id: uuid.UUID
    kind: str
    severity: str
    message: str
    recipient_label: str
    destination: str
    delivery_status: str
    is_test: bool
    created_at: datetime


class OperationalStatusResponse(BaseModel):
    observed_at: datetime
    request_metrics: dict[str, Any]
    database_pool: dict[str, Any]
    event_pipeline: dict[str, Any]
    completeness: dict[str, Any]
    override_state: dict[str, Any]
    alerts: list[OperationalAlertResponse]
    evidence_scope: str
