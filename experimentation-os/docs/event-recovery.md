# Event delivery and recovery

This runbook covers the Day 3 local pipeline. It does not establish a production owner, alert destination, retention approval, or managed-service procedure; those values remain **unknown**.

## What each state means

- **Stored in host outbox:** the host wrote the event to its private persistent filesystem. ExperimentOS has not necessarily received it.
- **Accepted (HTTP 202 per item):** the collector validated the event and the durable queue returned a message ID. It is not yet an analytical contribution.
- **Stored:** the worker committed the raw event, delivery receipt, and one derivation-version contribution in one database transaction before acknowledging the queue message.
- **Quarantined:** the event cannot contribute. The reason and conflicting payload are retained for review.
- **Dead-lettered:** bounded delivery attempts were exhausted or the queue envelope could not be interpreted. This is an operational fault, not valid analysis evidence.

## Local inspection

1. Start the local stack with `docker compose up --build -d`.
2. Confirm `postgres`, `localstack`, and `api` are healthy; confirm `migrate`, `seed-demo`, and `queue-bootstrap` exited successfully; confirm `ingestion-worker` is running.
3. Inspect structured worker state labels with `docker compose logs ingestion-worker`. Logs deliberately exclude event payloads, subject IDs, assignment tokens, and service credentials.
4. Query scoped counts in PostgreSQL for `raw_events`, `event_contributions`, `event_receipts`, and `quarantined_events`. Reconcile by retained event ID, not only by global totals.

## Retry and dependency interruption

- A collector response without per-item HTTP 202 acceptance is not success. Keep the event in the host outbox and retry the same event ID.
- Queue messages are acknowledged only after the database commit. A crash before commit leaves no raw event, receipt, or contribution. A crash after commit causes redelivery, which returns the retained record without adding a second contribution.
- Transient worker failures extend visibility with bounded backoff. Exhausted attempts are copied to the dead-letter queue and removed from the main queue.
- Never create a new event ID merely because publication timed out; doing so defeats deduplication.

## Conflict quarantine

If an existing scoped event ID arrives with a different semantic hash, retain the first raw event and contribution, store the conflicting envelope in `quarantined_events`, and mark its delivery receipt `quarantined`. Do not choose a winner automatically or edit the retained event.

## Dead-letter recovery

1. Stop or repair the source of the failure first. Record the affected project, environment, event IDs, time range, failure reason, reviewer, and proposed replay version. The real owner/reviewer is **unknown**.
2. Copy dead-letter messages to an isolated review set. Do not print credentials, assignment tokens, source identities, or payloads into tickets or logs.
3. Validate assignment scope and token again. Conflicts remain quarantined.
4. Republish the original envelope with its original event ID to the main queue. Do not delete the dead-letter copy until database receipt and contribution reconciliation succeeds.
5. Compare accepted queue identities with receipts, raw events, quarantines, and contributions by event ID. Any unexplained gap blocks downstream finalization.

## Versioned replay

Run replay only with a new `events-*` derivation version, for example:

```sh
cd backend
uv run python -m app.workers.replay \
  --environment-id REPLACE_WITH_REVIEWED_ENVIRONMENT_UUID \
  --derivation-version events-v2-review
```

Replay reads retained raw events and creates a separate contribution set. Repeating the same replay version is idempotent. Compare the old and new versions before any reader switch. This command does not modify or invalidate analysis snapshots, and Day 3 does not authorize switching production readers.

## Escalation and evidence gaps

- Production operations owner, backup, paging route, queue-age threshold, quarantine threshold, and maximum approved outage are **unknown**.
- LocalStack verifies the application contract only. Managed SQS redrive, retention, encryption, IAM, alarms, quotas, and outage behavior remain unverified under zero-spend mode.
- Unresolved dead letters, quarantines, or reconciliation gaps block finalization; they are never converted into zero outcomes silently.
