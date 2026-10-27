import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import (
    Assignment,
    ConfigurationVersion,
    Environment,
    Experiment,
    ExperimentStatus,
    Organization,
    Project,
)
from app.domain.assignment import resolve_assignment
from app.schemas import AssignmentConfiguration


def test_simultaneous_assignment_requests_converge_on_one_row(tmp_path) -> None:  # type: ignore[no-untyped-def]
    engine = create_engine(
        f"sqlite:///{tmp_path / 'concurrency.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    organization_id, project_id, environment_id = [uuid.uuid4() for _ in range(3)]
    experiment_id, configuration_id = uuid.uuid4(), uuid.uuid4()
    configuration_document = AssignmentConfiguration(
        identity_namespace="subject",
        traffic_allocation_basis_points=10_000,
        salt="concurrent-assignment-salt",
    )
    with Session(engine) as session:
        session.add(Organization(id=organization_id, name="Concurrency test"))
        session.add(Project(id=project_id, organization_id=organization_id, key="p", name="P"))
        session.add(Environment(id=environment_id, project_id=project_id, key="e", name="E"))
        experiment = Experiment(
            id=experiment_id,
            project_id=project_id,
            environment_id=environment_id,
            key="concurrent",
            name="Concurrent",
            owner_subject="test",
            status=ExperimentStatus.RUNNING,
            version=3,
        )
        session.add(experiment)
        session.flush()
        configuration = ConfigurationVersion(
            id=configuration_id,
            experiment_id=experiment_id,
            version=1,
            document=configuration_document.model_dump(mode="json"),
            digest="0" * 64,
            approved_at=datetime.now(UTC),
            approved_by_subject="test",
        )
        session.add(configuration)
        session.flush()
        experiment.active_configuration_version_id = configuration_id
        session.commit()

    barrier = Barrier(2)

    def assign() -> uuid.UUID:
        with Session(engine, expire_on_commit=False) as session:
            experiment = session.get(Experiment, experiment_id)
            configuration = session.get(ConfigurationVersion, configuration_id)
            assert experiment is not None and configuration is not None
            barrier.wait()
            result = resolve_assignment(
                session,
                experiment=experiment,
                configuration_version=configuration,
                configuration=configuration_document,
                subject_id="same-subject",
                attributes={},
            )
            assert result.assignment is not None
            return result.assignment.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        identifiers = list(pool.map(lambda _: assign(), range(2)))
    assert identifiers[0] == identifiers[1]
    with Session(engine) as session:
        rows = session.scalars(select(Assignment)).all()
        assert len(rows) == 1
    engine.dispose()
