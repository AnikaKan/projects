from __future__ import annotations

import json
from typing import Any

import boto3

from app.config import Settings


def ensure_queues(settings: Settings) -> None:
    client: Any = boto3.client(
        "sqs",
        region_name=settings.sqs_region,
        endpoint_url=settings.sqs_endpoint_url,
        aws_access_key_id="local" if settings.sqs_endpoint_url else None,
        aws_secret_access_key="local" if settings.sqs_endpoint_url else None,
    )
    dlq = client.create_queue(QueueName=settings.event_dlq_name)
    dlq_attributes = client.get_queue_attributes(
        QueueUrl=dlq["QueueUrl"], AttributeNames=["QueueArn"]
    )["Attributes"]
    client.create_queue(
        QueueName=settings.event_queue_name,
        Attributes={
            "VisibilityTimeout": str(settings.event_visibility_timeout_seconds),
            "MessageRetentionPeriod": str(14 * 24 * 60 * 60),
            "RedrivePolicy": json.dumps(
                {
                    "deadLetterTargetArn": dlq_attributes["QueueArn"],
                    "maxReceiveCount": settings.event_max_receive_count,
                }
            ),
        },
    )


if __name__ == "__main__":
    ensure_queues(Settings())
