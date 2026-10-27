# Backlog and ingestion outage

Primary owner: **Unknown**  
Backup owner: **Unknown**

1. Confirm collection responses, queue depth/age, worker failures, database saturation, dead letters, quarantine, and reconciliation delay without logging payloads or identities.
2. If durable acceptance is uncertain, keep the original event in the host outbox and retry the same event ID.
3. Stop analysis finalization when checkpoints, receipts, queue delivery, or raw/derived counts are incomplete.
4. Repair the dependency before increasing workers. Bound worker concurrency to protect PostgreSQL.
5. Reconcile accepted IDs → receipts → raw events/quarantine → contributions. Backlog depth reaching zero is not sufficient evidence.
6. Create a new cohort/analysis version only after coverage and lateness gates pass; never mutate a finalized snapshot.

Verification: pause the affected local dependency, observe readiness/metrics fail, resume it, drain the queue, and compare scoped counts. Managed queue alarms and real alert delivery remain unverified.
