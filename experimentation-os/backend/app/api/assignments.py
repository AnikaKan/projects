import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AnalysisPlan, ConfigurationVersion, Experiment
from app.domain.assignment import assignment_token, resolve_assignment
from app.schemas import (
    AnalysisPlanDocument,
    AssignmentConfiguration,
    AssignmentResolveRequest,
    AssignmentResponse,
    AssignmentState,
)
from app.security import (
    ServicePrincipal,
    require_service_capability,
    session_from_request,
    settings_from_request,
)

router = APIRouter(tags=["assignments"])


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_key}/assignments/resolve",
    response_model=AssignmentResponse,
)
def resolve(
    request: Request,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_key: str,
    payload: AssignmentResolveRequest,
    principal: ServicePrincipal = Depends(require_service_capability("assignment")),
    session: Session = Depends(session_from_request),
) -> AssignmentResponse:
    if principal.project_id != project_id or principal.environment_id != environment_id:
        raise HTTPException(status_code=403, detail="credential scope mismatch")
    experiment = session.scalar(
        select(Experiment).where(
            Experiment.project_id == project_id,
            Experiment.environment_id == environment_id,
            Experiment.key == experiment_key,
        )
    )
    if experiment is None:
        return AssignmentResponse(state=AssignmentState.NOT_RUNNING, reason="experiment not found")
    if experiment.active_configuration_version_id is None:
        raise HTTPException(status_code=500, detail="experiment configuration is missing")
    if experiment.active_analysis_plan_id is None:
        raise HTTPException(status_code=500, detail="experiment analysis plan is missing")
    configuration_version = session.get(
        ConfigurationVersion, experiment.active_configuration_version_id
    )
    if configuration_version is None:
        raise HTTPException(status_code=500, detail="configuration version is missing")
    analysis_plan = session.get(AnalysisPlan, experiment.active_analysis_plan_id)
    if analysis_plan is None:
        raise HTTPException(status_code=500, detail="analysis plan is missing")
    configuration = AssignmentConfiguration.model_validate(configuration_version.document)
    plan = AnalysisPlanDocument.model_validate(analysis_plan.document)
    resolution = resolve_assignment(
        session,
        experiment=experiment,
        configuration_version=configuration_version,
        configuration=configuration,
        subject_id=payload.subject_id,
        attributes=payload.attributes,
        enrollment_ends_at=plan.enrollment_ends_at,
    )
    assignment = resolution.assignment
    return AssignmentResponse(
        state=resolution.state,
        experiment_id=resolution.experiment_id,
        configuration_version_id=resolution.configuration_version_id,
        assignment_id=assignment.id if assignment else None,
        arm=assignment.arm if assignment else None,
        assignment_token=(
            assignment_token(assignment, settings_from_request(request).credential_pepper)
            if assignment and resolution.state is AssignmentState.ASSIGNED
            else None
        ),
        existing=resolution.existing,
        reason=resolution.reason,
    )
