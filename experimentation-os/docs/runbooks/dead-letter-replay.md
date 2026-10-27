# Dead-letter replay

Primary owner: **Unknown**  
Backup owner: **Unknown**

1. Record the scoped environment, event IDs, failure class, time range, approver, and new replay version. Do not paste event bodies or tokens into tickets.
2. Repair the failure and copy dead letters into an isolated review set.
3. Revalidate credential scope, assignment token, event ID, attribution, and allowlisted event type.
4. Republish the original envelope and original event ID; do not manufacture a replacement ID.
5. Delete the dead-letter copy only after a receipt and raw/quarantine/contribution reconciliation exists.
6. Replay retained raw events into a new `events-*` derivation version. Repeat the same version to prove idempotence.
7. Keep finalization blocked for any unexplained gap or conflict.

The Day 7 local drill moves one synthetic failed envelope from the LocalStack DLQ to the main queue and verifies exactly one new raw event/contribution.
