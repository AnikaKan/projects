from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from app.config import RuntimeEnvironment, Settings


class QueueUnavailable(RuntimeError):
    """The durable queue did not provide a definite acceptance result."""


@dataclass(frozen=True)
class QueueDelivery:
    message_id: str
    receipt_handle: str
    receive_count: int
    body: dict[str, Any]
    sent_at: datetime | None = None


class EventQueue(Protocol):
    def publish(self, event: dict[str, Any]) -> str: ...

    def receive(self, *, max_messages: int = 10) -> list[QueueDelivery]: ...

    def acknowledge(self, delivery: QueueDelivery) -> None: ...

    def retry_later(self, delivery: QueueDelivery, *, delay_seconds: int) -> None: ...

    def dead_letter(self, delivery: QueueDelivery, *, reason: str) -> None: ...

    def operational_snapshot(self) -> dict[str, Any]: ...


class InMemoryEventQueue:
    """Explicit test-only queue; never selected in staging or production."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: list[QueueDelivery] = []
        self.dead_letters: list[dict[str, Any]] = []
        self.fail_event_ids: set[str] = set()
        self.ambiguous_event_ids: set[str] = set()

    def publish(self, event: dict[str, Any]) -> str:
        event_id = str(event["event"]["event_id"])
        if event_id in self.fail_event_ids:
            raise QueueUnavailable("queue rejected publication")
        message_id = str(uuid.uuid4())
        delivery = QueueDelivery(message_id, message_id, 1, event.copy(), datetime.now(UTC))
        with self._lock:
            self._pending.append(delivery)
        if event_id in self.ambiguous_event_ids:
            raise QueueUnavailable("queue acceptance was ambiguous")
        return message_id

    def receive(self, *, max_messages: int = 10) -> list[QueueDelivery]:
        with self._lock:
            deliveries = self._pending[:max_messages]
            self._pending = self._pending[max_messages:]
        return deliveries

    def acknowledge(self, delivery: QueueDelivery) -> None:
        return None

    def retry_later(self, delivery: QueueDelivery, *, delay_seconds: int) -> None:
        retried = QueueDelivery(
            delivery.message_id,
            delivery.receipt_handle,
            delivery.receive_count + 1,
            delivery.body,
            delivery.sent_at,
        )
        with self._lock:
            self._pending.append(retried)

    def dead_letter(self, delivery: QueueDelivery, *, reason: str) -> None:
        self.dead_letters.append({"event": delivery.body, "reason": reason})

    def operational_snapshot(self) -> dict[str, Any]:
        with self._lock:
            pending = list(self._pending)
        ages = [
            max(0.0, (datetime.now(UTC) - item.sent_at).total_seconds())
            for item in pending
            if item.sent_at is not None
        ]
        return {
            "pending_messages": len(pending),
            "dead_letter_messages": len(self.dead_letters),
            "oldest_pending_age_seconds": max(ages, default=0.0),
            "source": "in_memory_test_queue",
        }


class SqsEventQueue:
    def __init__(self, settings: Settings) -> None:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import BotoCoreError, ClientError

        self._settings = settings
        self._queue_errors = (BotoCoreError, ClientError)
        self._queue_errors_with_key = (*self._queue_errors, KeyError)
        self._publish_errors = (*self._queue_errors, KeyError, TimeoutError)
        self._client: Any = boto3.client(
            "sqs",
            region_name=settings.sqs_region,
            endpoint_url=settings.sqs_endpoint_url,
            aws_access_key_id="local" if settings.sqs_endpoint_url else None,
            aws_secret_access_key="local" if settings.sqs_endpoint_url else None,
            config=Config(
                connect_timeout=2,
                read_timeout=5,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )
        self._queue_url: str | None = None
        self._dlq_url: str | None = None

    def _url(self, *, dead_letter: bool = False) -> str:
        existing = self._dlq_url if dead_letter else self._queue_url
        if existing:
            return existing
        name = self._settings.event_dlq_name if dead_letter else self._settings.event_queue_name
        try:
            value = str(self._client.get_queue_url(QueueName=name)["QueueUrl"])
        except self._queue_errors_with_key as exc:
            raise QueueUnavailable("durable queue is unavailable") from exc
        if dead_letter:
            self._dlq_url = value
        else:
            self._queue_url = value
        return value

    def publish(self, event: dict[str, Any]) -> str:
        try:
            response = self._client.send_message(
                QueueUrl=self._url(),
                MessageBody=json.dumps(event, sort_keys=True, separators=(",", ":")),
            )
            return str(response["MessageId"])
        except self._publish_errors as exc:
            raise QueueUnavailable("queue acceptance was not confirmed") from exc

    def receive(self, *, max_messages: int = 10) -> list[QueueDelivery]:
        try:
            response = self._client.receive_message(
                QueueUrl=self._url(),
                MaxNumberOfMessages=max(1, min(max_messages, 10)),
                WaitTimeSeconds=2,
                VisibilityTimeout=self._settings.event_visibility_timeout_seconds,
                AttributeNames=["ApproximateReceiveCount", "SentTimestamp"],
            )
        except self._queue_errors as exc:
            raise QueueUnavailable("durable queue receive failed") from exc
        deliveries: list[QueueDelivery] = []
        for message in response.get("Messages", []):
            try:
                body = json.loads(message["Body"])
                deliveries.append(
                    QueueDelivery(
                        message_id=str(message["MessageId"]),
                        receipt_handle=str(message["ReceiptHandle"]),
                        receive_count=int(
                            message.get("Attributes", {}).get("ApproximateReceiveCount", 1)
                        ),
                        body=body,
                        sent_at=(
                            datetime.fromtimestamp(
                                int(message.get("Attributes", {}).get("SentTimestamp", 0)) / 1000,
                                tz=UTC,
                            )
                            if message.get("Attributes", {}).get("SentTimestamp")
                            else None
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                malformed = QueueDelivery(
                    message_id=str(message.get("MessageId", uuid.uuid4())),
                    receipt_handle=str(message.get("ReceiptHandle", "")),
                    receive_count=1,
                    body={"malformed_message": True},
                    sent_at=None,
                )
                self.dead_letter(malformed, reason="malformed queue message")
        return deliveries

    def acknowledge(self, delivery: QueueDelivery) -> None:
        self._client.delete_message(QueueUrl=self._url(), ReceiptHandle=delivery.receipt_handle)

    def retry_later(self, delivery: QueueDelivery, *, delay_seconds: int) -> None:
        self._client.change_message_visibility(
            QueueUrl=self._url(),
            ReceiptHandle=delivery.receipt_handle,
            VisibilityTimeout=max(0, min(delay_seconds, 43_200)),
        )

    def dead_letter(self, delivery: QueueDelivery, *, reason: str) -> None:
        body = {"failed_event": delivery.body, "failure_reason": reason[:500]}
        self._client.send_message(
            QueueUrl=self._url(dead_letter=True),
            MessageBody=json.dumps(body, sort_keys=True, separators=(",", ":")),
        )
        if delivery.receipt_handle:
            self.acknowledge(delivery)

    def operational_snapshot(self) -> dict[str, Any]:
        try:
            main = self._client.get_queue_attributes(
                QueueUrl=self._url(),
                AttributeNames=[
                    "ApproximateNumberOfMessages",
                    "ApproximateNumberOfMessagesNotVisible",
                ],
            )["Attributes"]
            dead = self._client.get_queue_attributes(
                QueueUrl=self._url(dead_letter=True),
                AttributeNames=["ApproximateNumberOfMessages"],
            )["Attributes"]
        except self._queue_errors_with_key as exc:
            raise QueueUnavailable("queue metrics are unavailable") from exc
        return {
            "pending_messages": int(main.get("ApproximateNumberOfMessages", 0)),
            "in_flight_messages": int(main.get("ApproximateNumberOfMessagesNotVisible", 0)),
            "dead_letter_messages": int(dead.get("ApproximateNumberOfMessages", 0)),
            "oldest_pending_age_seconds": None,
            "source": "sqs_approximate_attributes; age requires observed delivery or CloudWatch",
        }


def create_event_queue(settings: Settings) -> EventQueue:
    if settings.environment is RuntimeEnvironment.TEST:
        return InMemoryEventQueue()
    return SqsEventQueue(settings)
