from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.scope import scoped_environment
from app.db.models import (
    AnalysisSnapshot,
    AuditRecord,
    CohortSnapshot,
    Decision,
    EventContribution,
    EventReceipt,
    Experiment,
    ExperimentStatus,
    OperationalAlert,
    OperatorRole,
    PipelineCheckpoint,
    QuarantinedEvent,
    RawEvent,
)
from app.event_queue import QueueUnavailable
from app.observability import OperationalMetrics
from app.schemas import (
    AlertTestRequest,
    AuditRecordResponse,
    DecisionCreateRequest,
    DecisionResponse,
    OperationalAlertResponse,
    OperationalStatusResponse,
    SnapshotInvalidationRequest,
)
from app.security import Principal, current_principal, require_roles, session_from_request

router = APIRouter(tags=["operations"])


def _scope(
    session: Session,
    principal: Principal,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
) -> None:
    scoped_environment(session, principal, project_id, environment_id)


def _snapshot(
    session: Session,
    *,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    snapshot_id: uuid.UUID,
) -> AnalysisSnapshot:
    snapshot = session.scalar(
        select(AnalysisSnapshot).where(
            AnalysisSnapshot.id == snapshot_id,
            AnalysisSnapshot.project_id == project_id,
            AnalysisSnapshot.environment_id == environment_id,
            AnalysisSnapshot.experiment_id == experiment_id,
        )
    )
    if snapshot is None:
        raise HTTPException(status_code=404, detail="analysis snapshot not found")
    return snapshot


def _decision_response(decision: Decision) -> DecisionResponse:
    return DecisionResponse(
        id=decision.id,
        snapshot_id=decision.snapshot_id,
        actor_subject=decision.actor_subject,
        action=decision.action,
        rationale=decision.rationale,
        rollout_reference=decision.rollout_reference,
        created_at=decision.created_at,
    )


def _alert_response(alert: OperationalAlert) -> OperationalAlertResponse:
    return OperationalAlertResponse(
        id=alert.id,
        kind=alert.kind,
        severity=alert.severity,
        message=alert.message,
        recipient_label=alert.recipient_label,
        destination=alert.destination,
        delivery_status=alert.delivery_status,
        is_test=alert.is_test,
        created_at=alert.created_at,
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/decisions",
    response_model=list[DecisionResponse],
)
def list_decisions(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> list[DecisionResponse]:
    _scope(session, principal, project_id, environment_id)
    experiment = session.scalar(
        select(Experiment.id).where(
            Experiment.id == experiment_id,
            Experiment.project_id == project_id,
            Experiment.environment_id == environment_id,
        )
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="experiment not found")
    rows = session.scalars(
        select(Decision)
        .join(AnalysisSnapshot, Decision.snapshot_id == AnalysisSnapshot.id)
        .where(AnalysisSnapshot.experiment_id == experiment_id)
        .order_by(Decision.created_at.desc())
    ).all()
    return [_decision_response(row) for row in rows]


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/analysis/{snapshot_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_decision(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    payload: DecisionCreateRequest,
    principal: Principal = Depends(
        require_roles(OperatorRole.APPROVER, OperatorRole.ADMINISTRATOR)
    ),
    session: Session = Depends(session_from_request),
) -> DecisionResponse:
    _scope(session, principal, project_id, environment_id)
    snapshot = _snapshot(
        session,
        project_id=project_id,
        environment_id=environment_id,
        experiment_id=experiment_id,
        snapshot_id=snapshot_id,
    )
    if snapshot.finalized_at is None or snapshot.recommendation is None:
        raise HTTPException(status_code=409, detail="analysis snapshot is not finalized")
    if snapshot.invalidated_at is not None:
        raise HTTPException(
            status_code=409, detail="invalidated analysis cannot receive a decision"
        )
    decision = Decision(
        snapshot_id=snapshot.id,
        actor_subject=principal.subject,
        action=payload.action,
        rationale=payload.rationale,
        rollout_reference=payload.rollout_reference,
    )
    session.add(decision)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="analysis_decision.recorded",
            detail={
                "experiment_id": str(experiment_id),
                "snapshot_id": str(snapshot.id),
                "decision": payload.action,
                "recommendation": snapshot.recommendation,
                "rollout_reference": payload.rollout_reference,
                "automatic_rollout": False,
            },
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="a human decision already exists for this snapshot"
        ) from exc
    return _decision_response(decision)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/analysis/{snapshot_id}/invalidate",
    response_model=dict[str, str],
)
def invalidate_snapshot(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    payload: SnapshotInvalidationRequest,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> dict[str, str]:
    _scope(session, principal, project_id, environment_id)
    snapshot = _snapshot(
        session,
        project_id=project_id,
        environment_id=environment_id,
        experiment_id=experiment_id,
        snapshot_id=snapshot_id,
    )
    if snapshot.invalidated_at is not None:
        raise HTTPException(status_code=409, detail="analysis snapshot is already invalidated")
    snapshot.invalidated_at = datetime.now(UTC)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="analysis_snapshot.invalidated",
            detail={
                "experiment_id": str(experiment_id),
                "snapshot_id": str(snapshot.id),
                "reason": payload.reason,
            },
        )
    )
    session.commit()
    return {"snapshot_id": str(snapshot.id), "status": "invalidated"}


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/audit",
    response_model=list[AuditRecordResponse],
)
def list_audit_records(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> list[AuditRecordResponse]:
    _scope(session, principal, project_id, environment_id)
    rows = session.scalars(
        select(AuditRecord)
        .where(
            AuditRecord.project_id == project_id,
            AuditRecord.environment_id == environment_id,
        )
        .order_by(AuditRecord.occurred_at.desc(), AuditRecord.id.desc())
        .limit(100)
    ).all()
    return [
        AuditRecordResponse(
            id=row.id,
            actor_type=row.actor_type,
            actor_id=row.actor_id,
            action=row.action,
            detail=row.detail,
            occurred_at=row.occurred_at,
        )
        for row in rows
    ]


def _count(session: Session, model: Any, *conditions: Any) -> int:
    return int(session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/operations/status",
    response_model=OperationalStatusResponse,
)
def operational_status(
    request: Request,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> OperationalStatusResponse:
    _scope(session, principal, project_id, environment_id)
    metrics: OperationalMetrics = request.app.state.operational_metrics
    engine = request.app.state.engine
    pool = engine.pool
    pool_snapshot = {
        "checked_out": pool.checkedout() if hasattr(pool, "checkedout") else None,
        "checked_in": pool.checkedin() if hasattr(pool, "checkedin") else None,
        "size": pool.size() if hasattr(pool, "size") else None,
        "overflow": pool.overflow() if hasattr(pool, "overflow") else None,
    }
    queue_error: str | None = None
    try:
        queue_snapshot = request.app.state.event_queue.operational_snapshot()
    except QueueUnavailable:
        queue_snapshot = {
            "pending_messages": None,
            "dead_letter_messages": None,
            "oldest_pending_age_seconds": None,
            "source": "queue metrics unavailable",
        }
        queue_error = "queue_unavailable"
    latest_cohort = session.scalar(
        select(CohortSnapshot)
        .where(
            CohortSnapshot.project_id == project_id,
            CohortSnapshot.environment_id == environment_id,
        )
        .order_by(CohortSnapshot.created_at.desc())
    )
    observed_queue_age = session.scalar(
        select(func.max(EventReceipt.queue_age_seconds)).where(
            EventReceipt.project_id == project_id,
            EventReceipt.environment_id == environment_id,
        )
    )
    observed_freshness = session.scalar(
        select(func.max(EventReceipt.reconciliation_delay_seconds)).where(
            EventReceipt.project_id == project_id,
            EventReceipt.environment_id == environment_id,
        )
    )
    raw_count = _count(
        session,
        RawEvent,
        RawEvent.project_id == project_id,
        RawEvent.environment_id == environment_id,
    )
    contribution_count = _count(
        session,
        EventContribution,
        EventContribution.project_id == project_id,
        EventContribution.environment_id == environment_id,
    )
    incomplete_checkpoints = _count(
        session,
        PipelineCheckpoint,
        PipelineCheckpoint.project_id == project_id,
        PipelineCheckpoint.environment_id == environment_id,
        PipelineCheckpoint.complete.is_(False),
    )
    alerts = session.scalars(
        select(OperationalAlert)
        .where(
            OperationalAlert.project_id == project_id,
            OperationalAlert.environment_id == environment_id,
        )
        .order_by(OperationalAlert.created_at.desc())
        .limit(10)
    ).all()
    return OperationalStatusResponse(
        observed_at=datetime.now(UTC),
        request_metrics={
            **metrics.snapshot(),
            "slow_request_threshold_milliseconds": (
                request.app.state.settings.request_slow_alert_milliseconds
            ),
        },
        database_pool=pool_snapshot,
        event_pipeline={
            **queue_snapshot,
            "queue_error": queue_error,
            "max_observed_delivery_queue_age_seconds": observed_queue_age,
            "max_observed_processing_freshness_seconds": observed_freshness,
            "raw_events": raw_count,
            "derived_contributions": contribution_count,
            "unreconciled_raw_events": max(0, raw_count - contribution_count),
            "quarantined_events": _count(
                session,
                QuarantinedEvent,
                QuarantinedEvent.project_id == project_id,
                QuarantinedEvent.environment_id == environment_id,
            ),
            "worker_failure_receipts": _count(
                session,
                EventReceipt,
                EventReceipt.project_id == project_id,
                EventReceipt.environment_id == environment_id,
                EventReceipt.failure_reason.is_not(None),
            ),
        },
        completeness={
            "incomplete_checkpoints": incomplete_checkpoints,
            "latest_cohort_version": latest_cohort.derivation_version if latest_cohort else None,
            "latest_cohort_finalization_ready": (
                latest_cohort.finalization_ready if latest_cohort else None
            ),
            "latest_cohort_readiness": latest_cohort.readiness if latest_cohort else {},
        },
        override_state={
            "emergency_stopped_experiments": _count(
                session,
                Experiment,
                Experiment.project_id == project_id,
                Experiment.environment_id == environment_id,
                Experiment.status == ExperimentStatus.STOPPED,
            )
        },
        alerts=[_alert_response(alert) for alert in alerts],
        evidence_scope=(
            "local process/database/queue-emulator observations; no routed production alert or "
            "managed-service claim"
        ),
    )


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/operations/test-alert",
    response_model=OperationalAlertResponse,
    status_code=status.HTTP_201_CREATED,
)
def deliver_test_alert(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    payload: AlertTestRequest,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> OperationalAlertResponse:
    _scope(session, principal, project_id, environment_id)
    alert = OperationalAlert(
        project_id=project_id,
        environment_id=environment_id,
        kind="test_delivery",
        severity="info",
        message="Synthetic local alert delivery test; no external message was sent.",
        recipient_label=payload.recipient_label,
        destination="local_database_test_sink",
        delivery_status="delivered_locally",
        is_test=True,
    )
    session.add(alert)
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=project_id,
            environment_id=environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action="operational_alert.test_delivered",
            detail={
                "recipient_label": payload.recipient_label,
                "destination": "local_database_test_sink",
                "external_delivery": False,
            },
        )
    )
    session.commit()
    return _alert_response(alert)
