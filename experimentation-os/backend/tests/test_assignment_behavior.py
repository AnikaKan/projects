from sqlalchemy import select

from app.db.models import Assignment
from tests.conftest import local_headers
from tests.test_experiment_lifecycle import experiment_url, payload


def create_service_token(client, ids, capabilities=None):  # type: ignore[no-untyped-def]
    selected_capabilities = capabilities or ["assignment"]
    response = client.post(
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}/credentials",
        json={
            "name": f"credential-{'-'.join(selected_capabilities)}",
            "capabilities": selected_capabilities,
        },
        headers=local_headers(ids, "administrator"),
    )
    assert response.status_code == 201
    return response.json()["secret"]


def launch(client, ids, key="welcome", traffic=10_000):  # type: ignore[no-untyped-def]
    url = experiment_url(ids)
    draft = client.post(
        url, json=payload(key, traffic), headers=local_headers(ids, "editor")
    ).json()
    client.post(
        f"{url}/{draft['id']}/approve",
        json={"expected_version": 1},
        headers=local_headers(ids, "approver"),
    )
    launched = client.post(
        f"{url}/{draft['id']}/launch",
        json={"expected_version": 2},
        headers=local_headers(ids, "approver"),
    )
    assert launched.status_code == 200
    return launched.json()


def assignment_url(ids, key="welcome"):  # type: ignore[no-untyped-def]
    return (
        f"/v1/projects/{ids['project']}/environments/{ids['environment']}"
        f"/experiments/{key}/assignments/resolve"
    )


def test_assignment_is_stable_scoped_and_eligibility_aware(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    launch(client, ids)
    token = create_service_token(client, ids)
    headers = {"Authorization": f"Bearer {token}"}
    request = {"subject_id": "person-1", "attributes": {"market": "US"}}
    first = client.post(assignment_url(ids), json=request, headers=headers)
    second = client.post(assignment_url(ids), json=request, headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()["state"] == "assigned"
    assert first.json()["assignment_id"] == second.json()["assignment_id"]
    assert second.json()["existing"] is True
    assert first.json()["assignment_token"].startswith("eat_")
    assert (
        client.post(
            assignment_url(ids),
            json={"subject_id": "person-2", "attributes": {"market": "FR"}},
            headers=headers,
        ).json()["state"]
        == "ineligible"
    )
    with session_factory() as session:
        assert len(session.scalars(select(Assignment)).all()) == 1

    wrong_environment = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}"
        "/experiments/welcome/assignments/resolve"
    )
    assert client.post(wrong_environment, json=request, headers=headers).status_code == 403


def test_enrollment_close_disable_and_capability(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    experiment = launch(client, ids)
    token = create_service_token(client, ids)
    headers = {"Authorization": f"Bearer {token}"}
    existing = client.post(
        assignment_url(ids),
        json={"subject_id": "existing", "attributes": {"market": "US"}},
        headers=headers,
    ).json()
    base = experiment_url(ids)
    closed = client.post(
        f"{base}/{experiment['id']}/close-enrollment",
        json={"expected_version": 3},
        headers=local_headers(ids, "editor"),
    )
    assert closed.status_code == 200
    assert (
        client.post(
            assignment_url(ids),
            json={"subject_id": "existing", "attributes": {}},
            headers=headers,
        ).json()["assignment_id"]
        == existing["assignment_id"]
    )
    assert (
        client.post(
            assignment_url(ids),
            json={"subject_id": "new", "attributes": {"market": "US"}},
            headers=headers,
        ).json()["state"]
        == "enrollment_closed"
    )
    disabled = client.post(
        f"{base}/{experiment['id']}/disable",
        json={"expected_version": 4, "reason": "guardrail concern"},
        headers=local_headers(ids, "administrator"),
    )
    assert disabled.status_code == 200
    assert (
        client.post(
            assignment_url(ids),
            json={"subject_id": "existing", "attributes": {}},
            headers=headers,
        ).json()["state"]
        == "disabled"
    )


def test_zero_traffic_and_wrong_capability_never_assign(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _ = seeded_app
    launch(client, ids, traffic=0)
    token = create_service_token(client, ids)
    response = client.post(
        assignment_url(ids),
        json={"subject_id": "person", "attributes": {"market": "US"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.json()["state"] == "out_of_traffic"
    denied_token = create_service_token(client, ids, ["event_ingestion"])
    assert (
        client.post(
            assignment_url(ids),
            json={"subject_id": "person-2", "attributes": {"market": "US"}},
            headers={"Authorization": f"Bearer {denied_token}"},
        ).status_code
        == 403
    )
