from __future__ import annotations

import base64
import hashlib
import hmac
import json
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.db.models import Assignment, ConfigurationVersion, Experiment, ExperimentStatus
from app.schemas import AssignmentConfiguration, AssignmentState

ALGORITHM_VERSION = "sha256-v1"
BUCKET_COUNT = 10_000


@dataclass(frozen=True)
class BucketResult:
    traffic_bucket: int
    arm_bucket: int


@dataclass(frozen=True)
class Resolution:
    state: AssignmentState
    experiment_id: uuid.UUID | None = None
    configuration_version_id: uuid.UUID | None = None
    assignment: Assignment | None = None
    existing: bool = False
    reason: str | None = None


def _normalized(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def canonical_hash_input(
    *,
    domain: str,
    salt: str,
    identity_namespace: str,
    experiment_id: uuid.UUID,
    configuration_version_id: uuid.UUID,
    subject_id: str,
) -> bytes:
    values = [
        "experimentos-assignment",
        ALGORITHM_VERSION,
        domain,
        _normalized(salt),
        _normalized(identity_namespace),
        str(experiment_id),
        str(configuration_version_id),
        _normalized(subject_id),
    ]
    return json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()


def hash_bucket(value: bytes) -> int:
    first_64_bits = int.from_bytes(hashlib.sha256(value).digest()[:8], "big")
    return first_64_bits * BUCKET_COUNT // (1 << 64)


def assignment_buckets(
    *,
    salt: str,
    identity_namespace: str,
    experiment_id: uuid.UUID,
    configuration_version_id: uuid.UUID,
    subject_id: str,
) -> BucketResult:
    return BucketResult(
        traffic_bucket=hash_bucket(
            canonical_hash_input(
                domain="traffic",
                salt=salt,
                identity_namespace=identity_namespace,
                experiment_id=experiment_id,
                configuration_version_id=configuration_version_id,
                subject_id=subject_id,
            )
        ),
        arm_bucket=hash_bucket(
            canonical_hash_input(
                domain="arm",
                salt=salt,
                identity_namespace=identity_namespace,
                experiment_id=experiment_id,
                configuration_version_id=configuration_version_id,
                subject_id=subject_id,
            )
        ),
    )


def is_eligible(configuration: AssignmentConfiguration, attributes: dict[str, str]) -> bool:
    rule = configuration.eligibility
    if rule is None:
        return True
    return attributes.get(rule.attribute) in rule.allowed_values


def _insert_assignment(session: Session, assignment: Assignment) -> tuple[Assignment, bool]:
    values = {
        "id": assignment.id,
        "project_id": assignment.project_id,
        "environment_id": assignment.environment_id,
        "experiment_id": assignment.experiment_id,
        "configuration_version_id": assignment.configuration_version_id,
        "subject_id": assignment.subject_id,
        "arm": assignment.arm,
        "assigned_at": assignment.assigned_at,
        "algorithm_version": assignment.algorithm_version,
    }
    dialect = session.get_bind().dialect.name
    conflict_columns = ["environment_id", "experiment_id", "subject_id"]
    if dialect == "postgresql":
        statement = (
            postgresql_insert(Assignment)
            .values(**values)
            .on_conflict_do_nothing(index_elements=conflict_columns)
            .returning(Assignment)
        )
    elif dialect == "sqlite":
        statement = (
            sqlite_insert(Assignment)
            .values(**values)
            .on_conflict_do_nothing(index_elements=conflict_columns)
            .returning(Assignment)
        )
    else:  # pragma: no cover - supported development and production dialects are above
        session.add(assignment)
        session.flush()
        return assignment, True

    inserted = session.scalar(statement)
    if inserted is not None:
        return inserted, True
    winner = session.scalar(
        select(Assignment).where(
            Assignment.environment_id == assignment.environment_id,
            Assignment.experiment_id == assignment.experiment_id,
            Assignment.subject_id == assignment.subject_id,
        )
    )
    if winner is None:  # pragma: no cover - defensive guard around database semantics
        raise RuntimeError("assignment conflict did not expose the winning row")
    return winner, False


def resolve_assignment(
    session: Session,
    *,
    experiment: Experiment,
    configuration_version: ConfigurationVersion,
    configuration: AssignmentConfiguration,
    subject_id: str,
    attributes: dict[str, str],
    enrollment_ends_at: datetime | None = None,
) -> Resolution:
    existing = session.scalar(
        select(Assignment).where(
            Assignment.environment_id == experiment.environment_id,
            Assignment.experiment_id == experiment.id,
            Assignment.subject_id == subject_id,
        )
    )
    if experiment.status is ExperimentStatus.STOPPED:
        return Resolution(
            state=AssignmentState.DISABLED,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            assignment=existing,
            existing=existing is not None,
            reason="experiment emergency-disabled",
        )
    if existing is not None and experiment.status in {
        ExperimentStatus.RUNNING,
        ExperimentStatus.ENROLLMENT_CLOSED,
    }:
        return Resolution(
            state=AssignmentState.ASSIGNED,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            assignment=existing,
            existing=True,
        )
    if enrollment_ends_at is not None and datetime.now(UTC) >= enrollment_ends_at.astimezone(UTC):
        return Resolution(
            state=AssignmentState.ENROLLMENT_CLOSED,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            reason="the frozen enrollment period has ended",
        )
    if experiment.status is ExperimentStatus.ENROLLMENT_CLOSED:
        return Resolution(
            state=AssignmentState.ENROLLMENT_CLOSED,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            reason="new enrollment is closed",
        )
    if experiment.status is not ExperimentStatus.RUNNING:
        return Resolution(
            state=AssignmentState.NOT_RUNNING,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            reason=f"experiment is {experiment.status.value}",
        )
    if not is_eligible(configuration, attributes):
        return Resolution(
            state=AssignmentState.INELIGIBLE,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            reason="frozen eligibility rule did not match",
        )

    buckets = assignment_buckets(
        salt=configuration.salt,
        identity_namespace=configuration.identity_namespace,
        experiment_id=experiment.id,
        configuration_version_id=configuration_version.id,
        subject_id=subject_id,
    )
    if buckets.traffic_bucket >= configuration.traffic_allocation_basis_points:
        return Resolution(
            state=AssignmentState.OUT_OF_TRAFFIC,
            experiment_id=experiment.id,
            configuration_version_id=configuration_version.id,
            reason="subject is outside the frozen traffic allocation",
        )

    proposed = Assignment(
        id=uuid.uuid4(),
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        configuration_version_id=configuration_version.id,
        subject_id=subject_id,
        arm="control" if buckets.arm_bucket < 5000 else "treatment",
        assigned_at=datetime.now(UTC),
        algorithm_version=ALGORITHM_VERSION,
    )
    winner, inserted = _insert_assignment(session, proposed)
    session.commit()
    return Resolution(
        state=AssignmentState.ASSIGNED,
        experiment_id=experiment.id,
        configuration_version_id=configuration_version.id,
        assignment=winner,
        existing=not inserted,
    )


def assignment_token(assignment: Assignment, pepper: str) -> str:
    payload = {
        "assignment_id": str(assignment.id),
        "configuration_version_id": str(assignment.configuration_version_id),
        "environment_id": str(assignment.environment_id),
        "experiment_id": str(assignment.experiment_id),
        "v": 1,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).rstrip(b"=")
    signature = hmac.new(
        pepper.encode(), b"experimentos-assignment-token-v1\x00" + encoded, hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"eat_{encoded.decode()}.{encoded_signature.decode()}"


def verify_assignment_token(token: str, pepper: str) -> dict[str, str | int]:
    try:
        encoded, supplied_signature = token.removeprefix("eat_").split(".", 1)
        padding = "=" * (-len(encoded) % 4)
        payload_bytes = base64.urlsafe_b64decode(encoded + padding)
        signature_padding = "=" * (-len(supplied_signature) % 4)
        signature = base64.urlsafe_b64decode(supplied_signature + signature_padding)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("invalid assignment token") from exc
    expected = hmac.new(
        pepper.encode(),
        b"experimentos-assignment-token-v1\x00" + encoded.encode(),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("invalid assignment token")
    try:
        payload = json.loads(payload_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("invalid assignment token") from exc
    required = {
        "assignment_id",
        "configuration_version_id",
        "environment_id",
        "experiment_id",
        "v",
    }
    if not isinstance(payload, dict) or set(payload) != required or payload.get("v") != 1:
        raise ValueError("invalid assignment token")
    return payload
