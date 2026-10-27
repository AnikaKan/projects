# Deploy and rollback

Primary owner: **Unknown**  
Backup owner: **Unknown**

## Deploy

1. Identify the authorized destination, immutable image digest, release record, database revision, and approved maintenance window.
2. Confirm backup restore evidence, managed identity, secret references, queue/database health, and alert receipt. Never copy local credentials.
3. Run migrations as a separate one-shot job before starting the candidate. Stop if the revision differs from the reviewed plan.
4. Start one candidate, verify liveness/readiness, scope denial, assignment stability, event reconciliation, and console privacy before increasing capacity.
5. Record image/schema versions, start/end time, operator, checks, and the go/no-go decision.

## Compatible application rollback

1. Stop traffic growth and preserve the current database; do not automatically reverse schema migrations.
2. Verify the previous image is declared compatible with the current schema.
3. Start the previous immutable image, then verify readiness, retained assignment ID/arm, scoped credentials, and event reads.
4. If attribution or reads fail, stop enrollment and invalidate affected analyses; do not reassign subjects.
5. Record rollback-to-ready time and the evidence used to reopen traffic.

Local command: `backend/.venv/bin/python scripts/drill_day7_recovery.py`. It tests distinct Day 7/Day 6 images against an isolated restored database, not a deployed environment.
