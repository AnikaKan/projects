"""Create a deterministic synthetic scope for the local zero-spend demo stack."""

import uuid

from sqlalchemy.orm import Session

from app.config import RuntimeEnvironment, Settings
from app.db.models import Environment, Organization, Project
from app.db.session import create_database_engine

DEMO_ORGANIZATION_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
DEMO_PROJECT_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")
DEMO_ENVIRONMENT_ID = uuid.UUID("00000000-0000-4000-8000-000000000003")


def main() -> None:
    settings = Settings()
    if settings.environment is not RuntimeEnvironment.LOCAL:
        raise RuntimeError("the synthetic demo seed is allowed only in the local environment")
    engine = create_database_engine(settings.database_url)
    with Session(engine) as session:
        if session.get(Organization, DEMO_ORGANIZATION_ID) is None:
            session.add(Organization(id=DEMO_ORGANIZATION_ID, name="ExperimentOS local demo"))
        if session.get(Project, DEMO_PROJECT_ID) is None:
            session.add(
                Project(
                    id=DEMO_PROJECT_ID,
                    organization_id=DEMO_ORGANIZATION_ID,
                    key="recruiter-demo",
                    name="Recruiter demo",
                )
            )
        if session.get(Environment, DEMO_ENVIRONMENT_ID) is None:
            session.add(
                Environment(
                    id=DEMO_ENVIRONMENT_ID,
                    project_id=DEMO_PROJECT_ID,
                    key="local",
                    name="Local synthetic environment",
                )
            )
        session.commit()
    engine.dispose()
    print("Synthetic local demo scope is ready.")


if __name__ == "__main__":
    main()
