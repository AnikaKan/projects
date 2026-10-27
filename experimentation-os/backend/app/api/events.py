from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.domain.events import PermanentEventError, event_envelope, validate_event_attribution
from app.event_queue import EventQueue, QueueUnavailable
from app.schemas import EventBatchRequest, EventBatchResponse, EventItemResult
from app.security import ServicePrincipal, require_service_capability, session_from_request

router = APIRouter(tags=["events"])
LOGGER = logging.getLogger(__name__)


def event_queue_from_request(request: Request) -> EventQueue:
    return request.app.state.event_queue  # type: ignore[no-any-return]


@router.post(
    "/v1/projects/{project_id}/environments/{environment_id}/events:collect",
    response_model=EventBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def collect_events(
    request: Request,
    response: Response,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    payload: EventBatchRequest,
    principal: ServicePrincipal = Depends(require_service_capability("event_ingestion")),
    session: Session = Depends(session_from_request),
) -> EventBatchResponse:
    if principal.project_id != project_id or principal.environment_id != environment_id:
        raise HTTPException(status_code=403, detail="credential scope mismatch")
    queue = event_queue_from_request(request)
    results: list[EventItemResult] = []
    for event in payload.events:
        try:
            validate_event_attribution(
                session,
                event=event,
                project_id=project_id,
                environment_id=environment_id,
                settings=request.app.state.settings,
            )
            message_id = queue.publish(
                event_envelope(event, project_id=project_id, environment_id=environment_id)
            )
            results.append(
                EventItemResult(
                    event_id=event.event_id,
                    accepted=True,
                    status_code=status.HTTP_202_ACCEPTED,
                    queue_message_id=message_id,
                )
            )
        except PermanentEventError as exc:
            results.append(
                EventItemResult(
                    event_id=event.event_id,
                    accepted=False,
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    reason=str(exc),
                )
            )
        except QueueUnavailable:
            results.append(
                EventItemResult(
                    event_id=event.event_id,
                    accepted=False,
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    reason="durable queue acceptance was not confirmed; retry this event ID",
                )
            )
    accepted = sum(item.accepted for item in results)
    failed = len(results) - accepted
    LOGGER.info("event_collection accepted=%d failed=%d", accepted, failed)
    if failed:
        response.status_code = status.HTTP_207_MULTI_STATUS
    return EventBatchResponse(accepted_count=accepted, failed_count=failed, results=results)
