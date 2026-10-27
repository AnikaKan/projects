import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.scope import scoped_environment
from app.db.models import AnalysisSnapshot, AuditRecord, CohortSnapshot, Experiment, OperatorRole
from app.domain.analysis import AnalysisBlocked, derive_analysis_snapshot
from app.schemas import AnalysisDeriveRequest, AnalysisSnapshotResponse
from app.security import Principal, current_principal, require_roles, session_from_request

router = APIRouter(tags=["analysis"])


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


def _response(snapshot: AnalysisSnapshot, *, created: bool = False) -> AnalysisSnapshotResponse:
    if (
        snapshot.cohort_snapshot_id is None
        or snapshot.analysis_version is None
        or snapshot.image_version is None
        or snapshot.library_versions is None
        or snapshot.recommendation is None
        or snapshot.finalized_at is None
    ):
        raise HTTPException(status_code=500, detail="analysis snapshot provenance is incomplete")
    return AnalysisSnapshotResponse(
        id=snapshot.id,
        experiment_id=snapshot.experiment_id,
        configuration_version_id=snapshot.configuration_version_id,
        analysis_plan_id=snapshot.analysis_plan_id,
        cohort_snapshot_id=snapshot.cohort_snapshot_id,
        analysis_version=snapshot.analysis_version,
        derivation_version=snapshot.derivation_version,
        code_version=snapshot.code_version,
        image_version=snapshot.image_version,
        library_versions=snapshot.library_versions,
        cutoff_at=snapshot.cutoff_at,
        source_counts=snapshot.source_counts,
        checks=snapshot.checks,
        results=snapshot.results,
        recommendation=snapshot.recommendation,
        finalized_at=snapshot.finalized_at,
        invalidated_at=snapshot.invalidated_at,
        created=created,
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/analysis",
    response_model=AnalysisSnapshotResponse,
)
def read_analysis(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> AnalysisSnapshotResponse:
    experiment = _experiment(session, principal, project_id, environment_id, experiment_id)
    snapshot = session.scalar(
        select(AnalysisSnapshot)
        .where(AnalysisSnapshot.experiment_id == experiment.id)
        .order_by(AnalysisSnapshot.created_at.desc(), AnalysisSnapshot.id.desc())
    )
    if snapshot is None:
        raise HTTPException(status_code=404, detail="analysis snapshot not derived")
    return _response(snapshot)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/analysis-snapshots",
    response_model=AnalysisSnapshotResponse,
)
def derive_analysis(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: AnalysisDeriveRequest,
    principal: Principal = Depends(
        require_roles(OperatorRole.APPROVER, OperatorRole.ADMINISTRATOR)
    ),
    session: Session = Depends(session_from_request),
) -> AnalysisSnapshotResponse:
    experiment = _experiment(session, principal, project_id, environment_id, experiment_id)
    cohort = session.scalar(
        select(CohortSnapshot).where(
            CohortSnapshot.id == payload.cohort_snapshot_id,
            CohortSnapshot.experiment_id == experiment.id,
            CohortSnapshot.project_id == project_id,
            CohortSnapshot.environment_id == environment_id,
        )
    )
    if cohort is None:
        raise HTTPException(status_code=404, detail="cohort snapshot not found")
    try:
        result = derive_analysis_snapshot(
            session,
            cohort_snapshot_id=cohort.id,
            analysis_version=payload.analysis_version,
        )
    except AnalysisBlocked as exc:
        raise HTTPException(status_code=409, detail={"reasons": exc.reasons}) from exc
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
                action="analysis_snapshot.finalized",
                detail={
                    "experiment_id": str(experiment.id),
                    "cohort_snapshot_id": str(cohort.id),
                    "analysis_snapshot_id": str(result.snapshot.id),
                    "analysis_version": payload.analysis_version,
                    "recommendation": result.snapshot.recommendation,
                    "automatic_rollout": False,
                },
            )
        )
        session.commit()
    return _response(result.snapshot, created=result.created)
