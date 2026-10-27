import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Environment, Project
from app.security import Principal


def scoped_environment(
    session: Session,
    principal: Principal,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
) -> tuple[Project, Environment]:
    row = session.execute(
        select(Project, Environment)
        .join(Environment, Environment.project_id == Project.id)
        .where(
            Project.id == project_id,
            Project.organization_id == principal.organization_id,
            Environment.id == environment_id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scope not found")
    return row[0], row[1]
