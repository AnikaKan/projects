import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.db.models import EventContribution, EventReceipt, QuarantinedEvent, RawEvent
from app.domain.events import (
    InjectedWorkerCrash,
    ProcessingResult,
    event_envelope,
    process_delivery,
    reconcile_assignment_events,
    replay_raw_events,
)
from app.event_queue import InMemoryEventQueue, QueueDelivery
from app.schemas import EventItem
from app.workers.ingestion import run_once
from tests.test_assignment_behavior import (
    assignment_url,
    create_service_token,
    launch,
)


def event_url(ids) -> str:  # type: ignore[no-untyped-def]
    return f"/v1/projects/{ids['project']}/environments/{ids['environment']}/events:collect"


def assigned(client, ids, token, subject="event-subject"):  # type: ignore[no-untyped-def]
    response = client.post(
        assignment_url(ids),
        json={"subject_id": subject, "attributes": {"market": "US"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["state"] == "assigned"
    return response.json()


def event(
    assignment,
    *,
    event_id="event-1",
    event_type="exposure",
    subject="event-subject",
    payload=None,
):  # type: ignore[no-untyped-def]
    return {
        "event_id": event_id,
        "schema_version": "1",
        "assignment_id": assignment["assignment_id"],
        "assignment_token": assignment["assignment_token"],
        "event_type": event_type,
        "occurred_at": datetime.now(UTC).isoformat(),
        "source_identity": subject,
        "correlation_id": f"correlation-{event_id}",
        "payload": payload or {},
    }


def setup_pipeline(seeded_app):  # type: ignore[no-untyped-def]
    client, ids, session_factory = seeded_app
    launch(client, ids)
    token = create_service_token(client, ids, ["assignment", "event_ingestion"])
    assignment = assigned(client, ids, token)
    queue = client.app.state.event_queue
    assert isinstance(queue, InMemoryEventQueue)
    return client, ids, session_factory, token, assignment, queue


def test_collection_auth_scope_validation_and_partial_batch(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, _, token, assignment, queue = setup_pipeline(seeded_app)
    queue.fail_event_ids.add("event-queue-down")
    response = client.post(
        event_url(ids),
        json={
            "events": [
                event(assignment, event_id="event-ok"),
                event(assignment, event_id="event-queue-down"),
                event(assignment, event_id="event-invalid-type", event_type="not_allowlisted"),
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 207
    assert response.json()["accepted_count"] == 1
    assert [item["status_code"] for item in response.json()["results"]] == [202, 503, 422]

    assignment_only = create_service_token(client, ids, ["assignment"])
    assert (
        client.post(
            event_url(ids),
            json={"events": [event(assignment)]},
            headers={"Authorization": f"Bearer {assignment_only}"},
        ).status_code
        == 403
    )
    sibling_url = (
        f"/v1/projects/{ids['project']}/environments/{ids['sibling_environment']}/events:collect"
    )
    assert (
        client.post(
            sibling_url,
            json={"events": [event(assignment)]},
            headers={"Authorization": f"Bearer {token}"},
        ).status_code
        == 403
    )


def test_worker_deduplicates_conflicts_and_reconciles_reordering(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory, token, assignment, queue = setup_pipeline(seeded_app)
    events = [
        event(assignment, event_id="outcome-first", event_type="completed_signup"),
        event(assignment, event_id="exposure-second", event_type="exposure"),
    ]
    response = client.post(
        event_url(ids),
        json={"events": events},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 202
    deliveries = queue.receive()
    for delivery in deliveries:
        with session_factory() as session:
            assert (
                process_delivery(session, delivery=delivery, settings=client.app.state.settings)
                is ProcessingResult.STORED
            )

    redelivery = deliveries[0]
    with session_factory() as session:
        assert (
            process_delivery(session, delivery=redelivery, settings=client.app.state.settings)
            is ProcessingResult.DUPLICATE
        )

    conflict = event(
        assignment,
        event_id="outcome-first",
        event_type="completed_signup",
        payload={"different": True},
    )
    conflict_response = client.post(
        event_url(ids),
        json={"events": [conflict]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert conflict_response.status_code == 202
    conflict_delivery = queue.receive()[0]
    with session_factory() as session:
        assert (
            process_delivery(
                session, delivery=conflict_delivery, settings=client.app.state.settings
            )
            is ProcessingResult.QUARANTINED
        )
        assert session.scalar(select(func.count()).select_from(RawEvent)) == 2
        assert session.scalar(select(func.count()).select_from(EventContribution)) == 2
        assert session.scalar(select(func.count()).select_from(QuarantinedEvent)) == 1
        reconciled = reconcile_assignment_events(session, uuid.UUID(assignment["assignment_id"]))
        assert set(reconciled) == {"completed_signup", "exposure"}


def test_crashes_before_and_after_commit_preserve_atomicity(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory, _, assignment, _ = setup_pipeline(seeded_app)
    item = EventItem.model_validate(event(assignment, event_id="crash-event"))
    envelope = event_envelope(item, project_id=ids["project"], environment_id=ids["environment"])
    delivery = QueueDelivery("delivery-crash", "receipt", 1, envelope)
    with session_factory() as session, pytest.raises(InjectedWorkerCrash):
        process_delivery(
            session,
            delivery=delivery,
            settings=client.app.state.settings,
            crash_point="before_commit",
        )
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(RawEvent)) == 0
        assert session.scalar(select(func.count()).select_from(EventContribution)) == 0
        assert session.scalar(select(func.count()).select_from(EventReceipt)) == 0

    with session_factory() as session, pytest.raises(InjectedWorkerCrash):
        process_delivery(
            session,
            delivery=delivery,
            settings=client.app.state.settings,
            crash_point="after_commit",
        )
    with session_factory() as session:
        assert (
            process_delivery(session, delivery=delivery, settings=client.app.state.settings)
            is ProcessingResult.DUPLICATE
        )
        assert session.scalar(select(func.count()).select_from(RawEvent)) == 1
        assert session.scalar(select(func.count()).select_from(EventContribution)) == 1
        assert session.scalar(select(func.count()).select_from(EventReceipt)) == 1


def test_ambiguous_publication_and_versioned_replay_are_idempotent(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, ids, session_factory, token, assignment, queue = setup_pipeline(seeded_app)
    queue.ambiguous_event_ids.add("ambiguous-event")
    request = {"events": [event(assignment, event_id="ambiguous-event")]}
    first = client.post(event_url(ids), json=request, headers={"Authorization": f"Bearer {token}"})
    second = client.post(event_url(ids), json=request, headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == second.status_code == 207
    deliveries = queue.receive()
    assert len(deliveries) == 2
    for delivery in deliveries:
        with session_factory() as session:
            process_delivery(session, delivery=delivery, settings=client.app.state.settings)
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(RawEvent)) == 1
        assert session.scalar(select(func.count()).select_from(EventContribution)) == 1
        assert (
            replay_raw_events(
                session,
                environment_id=ids["environment"],
                derivation_version="events-v2-test",
            )
            == 1
        )
        assert (
            replay_raw_events(
                session,
                environment_id=ids["environment"],
                derivation_version="events-v2-test",
            )
            == 0
        )
        assert session.scalar(select(func.count()).select_from(EventContribution)) == 2


def test_malformed_delivery_uses_bounded_retry_then_dead_letter(seeded_app) -> None:  # type: ignore[no-untyped-def]
    client, _, session_factory, _, _, queue = setup_pipeline(seeded_app)
    queue._pending.append(QueueDelivery("malformed", "malformed", 1, {"not": "an event envelope"}))
    settings = client.app.state.settings.model_copy(update={"event_max_receive_count": 2})
    assert run_once(queue=queue, session_factory=session_factory, settings=settings) == 0
    assert run_once(queue=queue, session_factory=session_factory, settings=settings) == 1
    assert len(queue.dead_letters) == 1
    assert queue.dead_letters[0]["reason"] == "queue envelope is malformed"
