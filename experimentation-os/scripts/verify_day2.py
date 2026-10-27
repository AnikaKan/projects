"""Run a zero-spend Day 2 lifecycle and assignment verification in one process."""

from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.config import AuthMode, RuntimeEnvironment, Settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.models import Assignment, Environment, Organization, Project  # noqa: E402
from app.db.session import create_session_factory  # noqa: E402
from app.main import create_app  # noqa: E402


def headers(organization_id: uuid.UUID, role: str) -> dict[str, str]:
    return {
        "X-Local-Subject": "day2-verifier@example.test",
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def main() -> None:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    organization_id, project_id, environment_id, sibling_id = [uuid.uuid4() for _ in range(4)]
    with Session(engine) as session:
        session.add(Organization(id=organization_id, name="Day 2 verifier"))
        session.add(
            Project(id=project_id, organization_id=organization_id, key="demo", name="Demo")
        )
        session.add_all(
            [
                Environment(id=environment_id, project_id=project_id, key="local", name="Local"),
                Environment(id=sibling_id, project_id=project_id, key="other", name="Other"),
            ]
        )
        session.commit()
    settings = Settings(
        EXPERIMENTOS_ENVIRONMENT=RuntimeEnvironment.TEST,
        AUTH_MODE=AuthMode.LOCAL,
        DATABASE_URL="sqlite://",
        CREDENTIAL_PEPPER="day2-verifier-pepper-0000000000000000",
    )
    app = create_app(settings)
    app.state.engine.dispose()
    app.state.engine = engine
    app.state.session_factory = session_factory
    base = f"/v1/projects/{project_id}/environments/{environment_id}/experiments"
    document = {
        "key": "signup-message",
        "name": "Signup message",
        "configuration": {
            "identity_namespace": "visitor",
            "traffic_allocation_basis_points": 10_000,
            "salt": "day2-verifier-salt-value",
            "eligibility": {"attribute": "market", "allowed_values": ["US"]},
        },
        "analysis_plan": {
            "hypothesis": "A clearer message improves signups.",
            "primary_metric": {"key": "completed_signup"},
            "guardrail_metric": {"key": "crash"},
            "guardrail_harm_margin_percentage_points": 1,
            "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "followup_hours": 24,
            "arrival_lateness_hours": 24,
        },
    }
    with TestClient(app) as client:
        assert (
            client.post(base, json=document, headers=headers(organization_id, "viewer")).status_code
            == 403
        )
        draft_response = client.post(
            base, json=document, headers=headers(organization_id, "editor")
        )
        assert draft_response.status_code == 201, draft_response.text
        draft = draft_response.json()
        approve = client.post(
            f"{base}/{draft['id']}/approve",
            json={"expected_version": 1},
            headers=headers(organization_id, "approver"),
        )
        assert approve.status_code == 200, approve.text
        launch = client.post(
            f"{base}/{draft['id']}/launch",
            json={"expected_version": 2},
            headers=headers(organization_id, "approver"),
        )
        assert launch.status_code == 200, launch.text
        credential_response = client.post(
            f"/v1/projects/{project_id}/environments/{environment_id}/credentials",
            json={"name": "host", "capabilities": ["assignment"]},
            headers=headers(organization_id, "administrator"),
        )
        assert credential_response.status_code == 201, credential_response.text
        service_headers = {"Authorization": f"Bearer {credential_response.json()['secret']}"}
        assignment_url = f"{base}/signup-message/assignments/resolve"
        request = {"subject_id": "visitor-1", "attributes": {"market": "US"}}
        first = client.post(assignment_url, json=request, headers=service_headers)
        second = client.post(assignment_url, json=request, headers=service_headers)
        assert first.status_code == 200, first.text
        assert first.json()["state"] == "assigned"
        assert first.json()["assignment_id"] == second.json()["assignment_id"]
        assert second.json()["existing"] is True
        assert (
            client.post(
                assignment_url,
                json={"subject_id": "visitor-2", "attributes": {"market": "FR"}},
                headers=service_headers,
            ).json()["state"]
            == "ineligible"
        )
        cross_scope = (
            f"/v1/projects/{project_id}/environments/{sibling_id}"
            "/experiments/signup-message/assignments/resolve"
        )
        assert client.post(cross_scope, json=request, headers=service_headers).status_code == 403
        close = client.post(
            f"{base}/{draft['id']}/close-enrollment",
            json={"expected_version": 3},
            headers=headers(organization_id, "editor"),
        )
        assert close.status_code == 200, close.text
        assert (
            client.post(
                assignment_url,
                json={"subject_id": "visitor-new", "attributes": {"market": "US"}},
                headers=service_headers,
            ).json()["state"]
            == "enrollment_closed"
        )
        disable = client.post(
            f"{base}/{draft['id']}/disable",
            json={"expected_version": 4, "reason": "verification"},
            headers=headers(organization_id, "administrator"),
        )
        assert disable.status_code == 200, disable.text
        assert (
            client.post(assignment_url, json=request, headers=service_headers).json()["state"]
            == "disabled"
        )
    with session_factory() as session:
        assert len(session.scalars(select(Assignment)).all()) == 1
    engine.dispose()
    print("Day 2 local lifecycle, scope, and assignment verification passed.")


if __name__ == "__main__":
    main()
