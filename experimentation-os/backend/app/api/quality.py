import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.scope import scoped_environment
from app.db.models import AuditRecord, CohortSnapshot, Experiment, OperatorRole
from app.domain.cohorts import derive_cohort_snapshot
from app.schemas import CohortDeriveRequest, CohortSnapshotResponse
from app.security import Principal, current_principal, require_roles, session_from_request

router = APIRouter(tags=["quality"])


def _experiment(
    session: Session,
    principal: Principal,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
) -> Experiment:
    scoped_environment(session, principal, project_id, environment_id)
    experiment = session.scalar(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.project_id == project_id,
            Experiment.environment_id == environment_id,
        )
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="experiment not found")
    return experiment


def _response(snapshot: CohortSnapshot, *, created: bool = False) -> CohortSnapshotResponse:
    return CohortSnapshotResponse(
        id=snapshot.id,
        experiment_id=snapshot.experiment_id,
        configuration_version_id=snapshot.configuration_version_id,
        analysis_plan_id=snapshot.analysis_plan_id,
        derivation_version=snapshot.derivation_version,
        event_derivation_version=snapshot.event_derivation_version,
        evaluated_at=snapshot.evaluated_at,
        arrival_cutoff_at=snapshot.arrival_cutoff_at,
        source_counts=snapshot.source_counts,
        arm_counts=snapshot.arm_counts,
        checks=snapshot.checks,
        readiness=snapshot.readiness,
        finalization_ready=snapshot.finalization_ready,
        created=created,
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/quality",
    response_model=CohortSnapshotResponse,
)
def read_quality(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> CohortSnapshotResponse:
    experiment = _experiment(session, principal, project_id, environment_id, experiment_id)
    snapshot = session.scalar(
        select(CohortSnapshot)
        .where(CohortSnapshot.experiment_id == experiment.id)
        .order_by(CohortSnapshot.created_at.desc(), CohortSnapshot.id.desc())
    )
    if snapshot is None:
        raise HTTPException(status_code=404, detail="quality snapshot not derived")
    return _response(snapshot)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/quality-snapshots",
    response_model=CohortSnapshotResponse,
)
def derive_quality(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: CohortDeriveRequest,
    principal: Principal = Depends(require_roles(OperatorRole.EDITOR, OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> CohortSnapshotResponse:
    experiment = _experiment(session, principal, project_id, environment_id, experiment_id)
    try:
        result = derive_cohort_snapshot(
            session,
            experiment_id=experiment.id,
            derivation_version=payload.derivation_version,
            event_derivation_version=payload.event_derivation_version,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result.created:
        session.add(
            AuditRecord(
                organization_id=principal.organization_id,
                project_id=project_id,
                environment_id=environment_id,
                actor_type="operator",
                actor_id=principal.subject,
                action="cohort_snapshot.derived",
                detail={
                    "experiment_id": str(experiment.id),
                    "snapshot_id": str(result.snapshot.id),
                    "derivation_version": payload.derivation_version,
                    "finalization_ready": result.snapshot.finalization_ready,
                },
            )
        )
        session.commit()
    return _response(result.snapshot, created=result.created)
