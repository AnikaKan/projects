import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import AuthMode, RuntimeEnvironment, Settings
from app.db.base import Base
from app.db.models import Environment, Organization, Project
from app.db.session import create_session_factory
from app.main import create_app


@pytest.fixture
def seeded_app() -> Iterator[tuple[TestClient, dict[str, uuid.UUID], object]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    organization_id = uuid.uuid4()
    other_organization_id = uuid.uuid4()
    project_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    sibling_environment_id = uuid.uuid4()
    other_environment_id = uuid.uuid4()
    with Session(engine) as session:
        session.add_all(
            [
                Organization(id=organization_id, name="Test organization"),
                Organization(id=other_organization_id, name="Other organization"),
                Project(
                    id=project_id,
                    organization_id=organization_id,
                    key="checkout",
                    name="Checkout",
                ),
                Project(
                    id=other_project_id,
                    organization_id=other_organization_id,
                    key="other",
                    name="Other",
                ),
                Environment(
                    id=environment_id,
                    project_id=project_id,
                    key="staging",
                    name="Staging",
                ),
                Environment(
                    id=sibling_environment_id,
                    project_id=project_id,
                    key="production",
                    name="Production",
                ),
                Environment(
                    id=other_environment_id,
                    project_id=other_project_id,
                    key="staging",
                    name="Other staging",
                ),
            ]
        )
        session.commit()
    settings = Settings(
        EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.TEST,
        AUTH_MODE=AuthMode.LOCAL,
        DATABASE_URL="sqlite://",
        CREDENTIAL_PEPPER="test-only-credential-pepper-000000000000",
    )
    app = create_app(settings)
    app.state.engine.dispose()
    app.state.engine = engine
    app.state.session_factory = session_factory
    ids = {
        "organization": organization_id,
        "other_organization": other_organization_id,
        "project": project_id,
        "other_project": other_project_id,
        "environment": environment_id,
        "sibling_environment": sibling_environment_id,
        "other_environment": other_environment_id,
    }
    with TestClient(app) as client:
        yield client, ids, session_factory
    engine.dispose()


def local_headers(ids: dict[str, uuid.UUID], role: str = "viewer") -> dict[str, str]:
    return {
        "X-Local-Subject": "operator@example.test",
        "X-Local-Organization-ID": str(ids["organization"]),
        "X-Local-Role": role,
    }
