from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    AnalysisPlan,
    Assignment,
    EventContribution,
    EventReceipt,
    Experiment,
    QuarantinedEvent,
    RawEvent,
    ReceiptStatus,
)
from app.domain.assignment import verify_assignment_token
from app.event_queue import QueueDelivery
from app.schemas import AnalysisPlanDocument, EventItem

DERIVATION_VERSION = "events-v1"


class ProcessingResult(StrEnum):
    STORED = "stored"
    DUPLICATE = "duplicate"
    QUARANTINED = "quarantined"


class PermanentEventError(ValueError):
    pass


class InjectedWorkerCrash(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidatedEvent:
    event: EventItem
    assignment: Assignment
    experiment: Experiment


def canonical_event_document(event: EventItem) -> dict[str, Any]:
    return {
        "assignment_id": str(event.assignment_id),
        "correlation_id": event.correlation_id,
        "event_id": event.event_id,
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.astimezone(UTC).isoformat(),
        "payload": event.payload,
        "schema_version": event.schema_version,
        "source_identity": event.source_identity,
    }


def event_payload_hash(event: EventItem) -> str:
    encoded = json.dumps(
        canonical_event_document(event), sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def validate_event_attribution(
    session: Session,
    *,
    event: EventItem,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    settings: Settings,
    check_timestamp: bool = True,
) -> ValidatedEvent:
    now = datetime.now(UTC)
    occurred_at = event.occurred_at.astimezone(UTC)
    if check_timestamp and occurred_at > now + timedelta(seconds=settings.event_max_future_seconds):
        raise PermanentEventError("event timestamp is too far in the future")
    if check_timestamp and occurred_at < now - timedelta(days=settings.event_max_age_days):
        raise PermanentEventError("event timestamp is older than the retention window")
    try:
        token = verify_assignment_token(event.assignment_token, settings.credential_pepper)
    except ValueError as exc:
        raise PermanentEventError("assignment token is invalid") from exc
    expected = {
        "assignment_id": str(event.assignment_id),
        "environment_id": str(environment_id),
    }
    if any(str(token.get(key)) != value for key, value in expected.items()):
        raise PermanentEventError("assignment token scope mismatch")
    assignment = session.scalar(
        select(Assignment).where(
            Assignment.id == event.assignment_id,
            Assignment.project_id == project_id,
            Assignment.environment_id == environment_id,
        )
    )
    if assignment is None:
        raise PermanentEventError("authoritative assignment not found")
    if assignment.subject_id != event.source_identity:
        raise PermanentEventError("source identity does not match the assignment")
    if str(token.get("experiment_id")) != str(assignment.experiment_id):
        raise PermanentEventError("assignment token experiment mismatch")
    if str(token.get("configuration_version_id")) != str(assignment.configuration_version_id):
        raise PermanentEventError("assignment token configuration mismatch")
    experiment = session.get(Experiment, assignment.experiment_id)
    if experiment is None or experiment.active_analysis_plan_id is None:
        raise PermanentEventError("experiment analysis plan is unavailable")
    plan_row = session.get(AnalysisPlan, experiment.active_analysis_plan_id)
    if plan_row is None:
        raise PermanentEventError("experiment analysis plan is unavailable")
    plan = AnalysisPlanDocument.model_validate(plan_row.document)
    allowed = {"exposure", plan.primary_metric.key, plan.guardrail_metric.key}
    if event.event_type not in allowed:
        raise PermanentEventError("event type is not allowlisted by the frozen plan")
    return ValidatedEvent(event, assignment, experiment)


def event_envelope(
    event: EventItem,
    *,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
) -> dict[str, Any]:
    return {
        "project_id": str(project_id),
        "environment_id": str(environment_id),
        "accepted_at": datetime.now(UTC).isoformat(),
        "event": event.model_dump(mode="json"),
    }


def _insert_raw_event(session: Session, raw: RawEvent) -> tuple[RawEvent, bool]:
    values = {
        "id": raw.id,
        "project_id": raw.project_id,
        "environment_id": raw.environment_id,
        "experiment_id": raw.experiment_id,
        "assignment_id": raw.assignment_id,
        "event_id": raw.event_id,
        "schema_version": raw.schema_version,
        "event_type": raw.event_type,
        "source_identity": raw.source_identity,
        "correlation_id": raw.correlation_id,
        "payload_hash": raw.payload_hash,
        "payload": raw.payload,
        "occurred_at": raw.occurred_at,
        "derivation_version": raw.derivation_version,
    }
    dialect = session.get_bind().dialect.name
    conflict_columns = ["environment_id", "event_id"]
    if dialect == "postgresql":
        statement = (
            postgresql_insert(RawEvent)
            .values(**values)
            .on_conflict_do_nothing(index_elements=conflict_columns)
            .returning(RawEvent)
        )
    elif dialect == "sqlite":
        statement = (
            sqlite_insert(RawEvent)
            .values(**values)
            .on_conflict_do_nothing(index_elements=conflict_columns)
            .returning(RawEvent)
        )
    else:  # pragma: no cover
        session.add(raw)
        session.flush()
        return raw, True
    inserted = session.scalar(statement)
    if inserted is not None:
        return inserted, True
    existing = session.scalar(
        select(RawEvent).where(
            RawEvent.environment_id == raw.environment_id,
            RawEvent.event_id == raw.event_id,
        )
    )
    if existing is None:  # pragma: no cover
        raise RuntimeError("event conflict did not expose the retained row")
    return existing, False


def _receipt(
    *,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    event_id: str,
    delivery: QueueDelivery,
    status: ReceiptStatus,
    reason: str | None = None,
    queue_age_seconds: float | None = None,
    reconciliation_delay_seconds: float | None = None,
) -> EventReceipt:
    return EventReceipt(
        project_id=project_id,
        environment_id=environment_id,
        delivery_id=delivery.message_id,
        queue_message_id=delivery.message_id,
        receive_count=delivery.receive_count,
        event_id=event_id,
        status=status,
        failure_reason=reason,
        queue_age_seconds=queue_age_seconds,
        reconciliation_delay_seconds=reconciliation_delay_seconds,
    )


def process_delivery(
    session: Session,
    *,
    delivery: QueueDelivery,
    settings: Settings,
    crash_point: str | None = None,
    queue_age_seconds: float | None = None,
    reconciliation_delay_seconds: float | None = None,
) -> ProcessingResult:
    body = delivery.body
    try:
        project_id = uuid.UUID(str(body["project_id"]))
        environment_id = uuid.UUID(str(body["environment_id"]))
        event = EventItem.model_validate(body["event"])
    except (KeyError, TypeError, ValueError) as exc:
        raise PermanentEventError("queue envelope is malformed") from exc

    prior_receipt = session.scalar(
        select(EventReceipt).where(
            EventReceipt.environment_id == environment_id,
            EventReceipt.delivery_id == delivery.message_id,
        )
    )
    if prior_receipt is not None:
        return (
            ProcessingResult.QUARANTINED
            if prior_receipt.status is ReceiptStatus.QUARANTINED
            else ProcessingResult.DUPLICATE
        )

    try:
        validated = validate_event_attribution(
            session,
            event=event,
            project_id=project_id,
            environment_id=environment_id,
            settings=settings,
        )
    except PermanentEventError as exc:
        digest = event_payload_hash(event)
        session.add(
            QuarantinedEvent(
                project_id=project_id,
                environment_id=environment_id,
                event_id=event.event_id,
                delivery_id=delivery.message_id,
                payload_hash=digest,
                payload=body,
                reason=str(exc),
            )
        )
        session.add(
            _receipt(
                project_id=project_id,
                environment_id=environment_id,
                event_id=event.event_id,
                delivery=delivery,
                status=ReceiptStatus.QUARANTINED,
                reason=str(exc),
                queue_age_seconds=queue_age_seconds,
                reconciliation_delay_seconds=reconciliation_delay_seconds,
            )
        )
        session.commit()
        return ProcessingResult.QUARANTINED

    digest = event_payload_hash(event)
    proposed = RawEvent(
        id=uuid.uuid4(),
        project_id=project_id,
        environment_id=environment_id,
        experiment_id=validated.experiment.id,
        assignment_id=validated.assignment.id,
        event_id=event.event_id,
        schema_version=event.schema_version,
        event_type=event.event_type,
        source_identity=event.source_identity,
        correlation_id=event.correlation_id,
        payload_hash=digest,
        payload=event.payload,
        occurred_at=event.occurred_at,
        derivation_version=DERIVATION_VERSION,
    )
    retained, inserted = _insert_raw_event(session, proposed)
    if not inserted and retained.payload_hash != digest:
        reason = "event ID was reused with a conflicting semantic payload"
        session.add(
            QuarantinedEvent(
                project_id=project_id,
                environment_id=environment_id,
                event_id=event.event_id,
                delivery_id=delivery.message_id,
                payload_hash=digest,
                payload=body,
                reason=reason,
            )
        )
        session.add(
            _receipt(
                project_id=project_id,
                environment_id=environment_id,
                event_id=event.event_id,
                delivery=delivery,
                status=ReceiptStatus.QUARANTINED,
                reason=reason,
                queue_age_seconds=queue_age_seconds,
                reconciliation_delay_seconds=reconciliation_delay_seconds,
            )
        )
        session.commit()
        return ProcessingResult.QUARANTINED

    if inserted:
        session.add(
            EventContribution(
                project_id=project_id,
                environment_id=environment_id,
                experiment_id=validated.experiment.id,
                assignment_id=validated.assignment.id,
                raw_event_id=retained.id,
                event_type=event.event_type,
                occurred_at=event.occurred_at,
                derivation_version=DERIVATION_VERSION,
            )
        )
    session.add(
        _receipt(
            project_id=project_id,
            environment_id=environment_id,
            event_id=event.event_id,
            delivery=delivery,
            status=ReceiptStatus.STORED,
            queue_age_seconds=queue_age_seconds,
            reconciliation_delay_seconds=reconciliation_delay_seconds,
        )
    )
    if crash_point == "before_commit":
        session.rollback()
        raise InjectedWorkerCrash("injected crash before commit")
    session.commit()
    if crash_point == "after_commit":
        raise InjectedWorkerCrash("injected crash after commit")
    return ProcessingResult.STORED if inserted else ProcessingResult.DUPLICATE


def reconcile_assignment_events(
    session: Session, assignment_id: uuid.UUID, *, derivation_version: str = DERIVATION_VERSION
) -> dict[str, list[str]]:
    rows = session.scalars(
        select(EventContribution)
        .where(
            EventContribution.assignment_id == assignment_id,
            EventContribution.derivation_version == derivation_version,
        )
        .order_by(EventContribution.occurred_at, EventContribution.id)
    )
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(row.event_type, []).append(row.occurred_at.astimezone(UTC).isoformat())
    return grouped


def replay_raw_events(
    session: Session, *, environment_id: uuid.UUID, derivation_version: str
) -> int:
    if derivation_version == DERIVATION_VERSION or not derivation_version.startswith("events-"):
        raise ValueError("replay requires a new events-* derivation version")
    created = 0
    raw_events = session.scalars(select(RawEvent).where(RawEvent.environment_id == environment_id))
    for raw in raw_events:
        existing = session.scalar(
            select(EventContribution.id).where(
                EventContribution.raw_event_id == raw.id,
                EventContribution.derivation_version == derivation_version,
            )
        )
        if existing is not None:
            continue
        session.add(
            EventContribution(
                project_id=raw.project_id,
                environment_id=raw.environment_id,
                experiment_id=raw.experiment_id,
                assignment_id=raw.assignment_id,
                raw_event_id=raw.id,
                event_type=raw.event_type,
                occurred_at=raw.occurred_at,
                derivation_version=derivation_version,
            )
        )
        created += 1
    session.commit()
    return created
