from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db.session import create_database_engine, create_session_factory
from app.domain.events import PermanentEventError, process_delivery
from app.event_queue import EventQueue, QueueUnavailable, create_event_queue

LOGGER = logging.getLogger(__name__)


def run_once(
    *, queue: EventQueue, session_factory: sessionmaker[Session], settings: Settings
) -> int:
    deliveries = queue.receive(max_messages=10)
    handled = 0
    for delivery in deliveries:
        now = datetime.now(UTC)
        queue_age_seconds = (
            max(0.0, (now - delivery.sent_at).total_seconds()) if delivery.sent_at else 0.0
        )
        if queue_age_seconds >= settings.event_queue_age_alert_seconds:
            LOGGER.warning("event_queue_age_alert queue_age_seconds=%.3f", queue_age_seconds)
        try:
            occurred_at_value = delivery.body.get("event", {}).get("occurred_at")
            reconciliation_delay_seconds = 0.0
            if isinstance(occurred_at_value, str):
                occurred_at = datetime.fromisoformat(occurred_at_value.replace("Z", "+00:00"))
                reconciliation_delay_seconds = max(0.0, (now - occurred_at).total_seconds())
            with session_factory() as session:
                result = process_delivery(
                    session,
                    delivery=delivery,
                    settings=settings,
                    queue_age_seconds=queue_age_seconds,
                    reconciliation_delay_seconds=reconciliation_delay_seconds,
                )
            queue.acknowledge(delivery)
            level = logging.WARNING if result.value == "quarantined" else logging.INFO
            LOGGER.log(
                level,
                "event_processed result=%s receive_count=%d queue_age_seconds=%.3f "
                "reconciliation_delay_seconds=%.3f",
                result.value,
                delivery.receive_count,
                queue_age_seconds,
                reconciliation_delay_seconds,
            )
            if reconciliation_delay_seconds >= settings.event_reconciliation_delay_alert_seconds:
                LOGGER.warning(
                    "event_reconciliation_delay_alert delay_seconds=%.3f",
                    reconciliation_delay_seconds,
                )
            handled += 1
        except PermanentEventError as exc:
            if delivery.receive_count >= settings.event_max_receive_count:
                queue.dead_letter(delivery, reason=str(exc))
                LOGGER.error("event_dead_lettered reason=permanent_validation")
                handled += 1
            else:
                queue.retry_later(delivery, delay_seconds=min(60, 2**delivery.receive_count))
                LOGGER.warning("event_retry reason=malformed_envelope")
        except Exception as exc:  # worker boundary converts dependency faults to bounded retries
            if delivery.receive_count >= settings.event_max_receive_count:
                queue.dead_letter(delivery, reason=type(exc).__name__)
                LOGGER.error("event_dead_lettered reason=retry_exhausted")
                handled += 1
            else:
                queue.retry_later(delivery, delay_seconds=min(60, 2**delivery.receive_count))
                LOGGER.warning("event_retry reason=transient_failure")
    return handled


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    settings = Settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    queue = create_event_queue(settings)
    LOGGER.info("ingestion_worker_started")
    while True:
        try:
            run_once(queue=queue, session_factory=session_factory, settings=settings)
        except QueueUnavailable:
            LOGGER.warning("queue_receive_unavailable")
            time.sleep(2)


if __name__ == "__main__":
    main()
