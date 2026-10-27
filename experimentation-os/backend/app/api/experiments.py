import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.scope import scoped_environment
from app.db.models import (
    AnalysisPlan,
    AuditRecord,
    ConfigurationVersion,
    Experiment,
    ExperimentStatus,
    OperatorRole,
)
from app.domain.documents import canonical_document, document_digest
from app.schemas import (
    AnalysisPlanDocument,
    AssignmentConfiguration,
    EmergencyDisableRequest,
    ExperimentCreateRequest,
    ExperimentDraftUpdateRequest,
    ExperimentResponse,
    ExperimentTransitionRequest,
)
from app.security import Principal, current_principal, require_roles, session_from_request

router = APIRouter(tags=["experiments"])


def _load_experiment(
    session: Session,
    principal: Principal,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    *,
    lock: bool = False,
) -> tuple[Experiment, ConfigurationVersion, AnalysisPlan]:
    scoped_environment(session, principal, project_id, environment_id)
    statement = select(Experiment).where(
        Experiment.id == experiment_id,
        Experiment.project_id == project_id,
        Experiment.environment_id == environment_id,
    )
    if lock:
        statement = statement.with_for_update()
    experiment = session.scalar(statement)
    if experiment is None:
        raise HTTPException(status_code=404, detail="experiment not found")
    if (
        experiment.active_configuration_version_id is None
        or experiment.active_analysis_plan_id is None
    ):
        raise HTTPException(status_code=500, detail="experiment version links are missing")
    configuration = session.get(ConfigurationVersion, experiment.active_configuration_version_id)
    plan = session.get(AnalysisPlan, experiment.active_analysis_plan_id)
    if configuration is None or plan is None:
        raise HTTPException(status_code=500, detail="experiment version records are missing")
    return experiment, configuration, plan


def _response(
    experiment: Experiment,
    configuration: ConfigurationVersion,
    plan: AnalysisPlan,
) -> ExperimentResponse:
    return ExperimentResponse(
        id=experiment.id,
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        key=experiment.key,
        name=experiment.name,
        owner_subject=experiment.owner_subject,
        status=experiment.status.value,
        version=experiment.version,
        configuration_version_id=configuration.id,
        configuration_version=configuration.version,
        configuration_digest=configuration.digest,
        configuration=AssignmentConfiguration.model_validate(configuration.document),
        analysis_plan_id=plan.id,
        analysis_plan_version=plan.version,
        analysis_plan_digest=plan.digest,
        analysis_plan=AnalysisPlanDocument.model_validate(plan.document),
    )


def _check_version(experiment: Experiment, expected_version: int) -> None:
    if experiment.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"version conflict; current version is {experiment.version}",
        )


def _audit(
    session: Session,
    principal: Principal,
    experiment: Experiment,
    action: str,
    detail: dict[str, object],
) -> None:
    session.add(
        AuditRecord(
            organization_id=principal.organization_id,
            project_id=experiment.project_id,
            environment_id=experiment.environment_id,
            actor_type="operator",
            actor_id=principal.subject,
            action=action,
            detail={"experiment_id": str(experiment.id), **detail},
        )
    )


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments",
    response_model=list[ExperimentResponse],
)
def list_experiments(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> list[ExperimentResponse]:
    scoped_environment(session, principal, project_id, environment_id)
    experiments = session.scalars(
        select(Experiment)
        .where(
            Experiment.project_id == project_id,
            Experiment.environment_id == environment_id,
        )
        .order_by(Experiment.created_at.desc())
    ).all()
    return [
        _response(*_load_experiment(session, principal, project_id, environment_id, item.id))
        for item in experiments
    ]


@router.get(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}",
    response_model=ExperimentResponse,
)
def read_experiment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    principal: Principal = Depends(current_principal),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    return _response(
        *_load_experiment(session, principal, project_id, environment_id, experiment_id)
    )


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments",
    response_model=ExperimentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_experiment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    payload: ExperimentCreateRequest,
    principal: Principal = Depends(require_roles(OperatorRole.EDITOR, OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    scoped_environment(session, principal, project_id, environment_id)
    experiment = Experiment(
        id=uuid.uuid4(),
        project_id=project_id,
        environment_id=environment_id,
        key=payload.key,
        name=payload.name,
        owner_subject=principal.subject,
        status=ExperimentStatus.DRAFT,
        version=1,
    )
    session.add(experiment)
    try:
        session.flush()
        configuration = ConfigurationVersion(
            id=uuid.uuid4(),
            experiment_id=experiment.id,
            version=1,
            document=canonical_document(payload.configuration),
            digest=document_digest(payload.configuration),
        )
        plan = AnalysisPlan(
            id=uuid.uuid4(),
            experiment_id=experiment.id,
            version=1,
            document=canonical_document(payload.analysis_plan),
            digest=document_digest(payload.analysis_plan),
        )
        session.add_all([configuration, plan])
        session.flush()
        experiment.active_configuration_version_id = configuration.id
        experiment.active_analysis_plan_id = plan.id
        _audit(
            session,
            principal,
            experiment,
            "experiment.created",
            {
                "configuration_digest": configuration.digest,
                "analysis_plan_digest": plan.digest,
            },
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="experiment key already exists") from exc
    return _response(experiment, configuration, plan)


@router.put(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}",
    response_model=ExperimentResponse,
)
def update_draft(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: ExperimentDraftUpdateRequest,
    principal: Principal = Depends(require_roles(OperatorRole.EDITOR, OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    experiment, current_configuration, current_plan = _load_experiment(
        session, principal, project_id, environment_id, experiment_id, lock=True
    )
    _check_version(experiment, payload.expected_version)
    if experiment.status is not ExperimentStatus.DRAFT:
        raise HTTPException(status_code=409, detail="approved experiment documents are immutable")

    next_version = max(current_configuration.version, current_plan.version) + 1
    configuration = ConfigurationVersion(
        id=uuid.uuid4(),
        experiment_id=experiment.id,
        version=next_version,
        document=canonical_document(payload.configuration),
        digest=document_digest(payload.configuration),
    )
    plan = AnalysisPlan(
        id=uuid.uuid4(),
        experiment_id=experiment.id,
        version=next_version,
        document=canonical_document(payload.analysis_plan),
        digest=document_digest(payload.analysis_plan),
    )
    session.add_all([configuration, plan])
    session.flush()
    experiment.name = payload.name
    experiment.active_configuration_version_id = configuration.id
    experiment.active_analysis_plan_id = plan.id
    experiment.version += 1
    _audit(
        session,
        principal,
        experiment,
        "experiment.draft_revised",
        {
            "configuration_digest": configuration.digest,
            "analysis_plan_digest": plan.digest,
            "document_version": next_version,
        },
    )
    session.commit()
    return _response(experiment, configuration, plan)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/approve",
    response_model=ExperimentResponse,
)
def approve_experiment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: ExperimentTransitionRequest,
    principal: Principal = Depends(
        require_roles(OperatorRole.APPROVER, OperatorRole.ADMINISTRATOR)
    ),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    experiment, configuration, plan = _load_experiment(
        session, principal, project_id, environment_id, experiment_id, lock=True
    )
    _check_version(experiment, payload.expected_version)
    if experiment.status is not ExperimentStatus.DRAFT:
        raise HTTPException(status_code=409, detail="only draft experiments can be approved")
    now = datetime.now(UTC)
    configuration.approved_at = now
    configuration.approved_by_subject = principal.subject
    plan.frozen_at = now
    experiment.status = ExperimentStatus.APPROVED
    experiment.version += 1
    _audit(
        session,
        principal,
        experiment,
        "experiment.approved",
        {
            "configuration_digest": configuration.digest,
            "analysis_plan_digest": plan.digest,
        },
    )
    session.commit()
    return _response(experiment, configuration, plan)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/launch",
    response_model=ExperimentResponse,
)
def launch_experiment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: ExperimentTransitionRequest,
    principal: Principal = Depends(
        require_roles(OperatorRole.APPROVER, OperatorRole.ADMINISTRATOR)
    ),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    experiment, configuration, plan = _load_experiment(
        session, principal, project_id, environment_id, experiment_id, lock=True
    )
    _check_version(experiment, payload.expected_version)
    if experiment.status is not ExperimentStatus.APPROVED:
        raise HTTPException(status_code=409, detail="only approved experiments can be launched")
    if configuration.approved_at is None or plan.frozen_at is None:
        raise HTTPException(
            status_code=409,
            detail="configuration and analysis plan must be frozen",
        )
    experiment.status = ExperimentStatus.RUNNING
    experiment.launched_at = datetime.now(UTC)
    experiment.version += 1
    _audit(session, principal, experiment, "experiment.launched", {})
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="another experiment is active in this environment"
        ) from exc
    return _response(experiment, configuration, plan)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/close-enrollment",
    response_model=ExperimentResponse,
)
def close_enrollment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: ExperimentTransitionRequest,
    principal: Principal = Depends(require_roles(OperatorRole.EDITOR, OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    experiment, configuration, plan = _load_experiment(
        session, principal, project_id, environment_id, experiment_id, lock=True
    )
    _check_version(experiment, payload.expected_version)
    if experiment.status is not ExperimentStatus.RUNNING:
        raise HTTPException(status_code=409, detail="only running experiments can close enrollment")
    experiment.status = ExperimentStatus.ENROLLMENT_CLOSED
    experiment.enrollment_closed_at = datetime.now(UTC)
    experiment.version += 1
    _audit(session, principal, experiment, "experiment.enrollment_closed", {})
    session.commit()
    return _response(experiment, configuration, plan)


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/disable",
    response_model=ExperimentResponse,
)
def emergency_disable(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: EmergencyDisableRequest,
    principal: Principal = Depends(require_roles(OperatorRole.ADMINISTRATOR)),
    session: Session = Depends(session_from_request),
) -> ExperimentResponse:
    experiment, configuration, plan = _load_experiment(
        session, principal, project_id, environment_id, experiment_id, lock=True
    )
    _check_version(experiment, payload.expected_version)
    if experiment.status not in {
        ExperimentStatus.RUNNING,
        ExperimentStatus.ENROLLMENT_CLOSED,
    }:
        raise HTTPException(status_code=409, detail="experiment is not operational")
    experiment.status = ExperimentStatus.STOPPED
    experiment.version += 1
    _audit(
        session,
        principal,
        experiment,
        "experiment.emergency_disabled",
        {"reason": payload.reason},
    )
    session.commit()
    return _response(experiment, configuration, plan)
