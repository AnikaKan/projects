# Database restore

Primary owner: **Unknown**  
Backup owner: **Unknown**

1. Declare the restore point, source backup, expected RPO/RTO, encryption/access boundary, and isolated target. Never overwrite the source database during a drill.
2. Restore into a new database and verify the Alembic revision before connecting an application.
3. Start one candidate API against the isolated database and verify readiness.
4. With a retained scoped credential, resolve a known subject and confirm the same assignment ID, arm, experiment, and configuration version.
5. Reconcile scoped assignments, raw events, receipts, quarantine, and contribution counts.
6. Replay raw data into a new derivation version twice; the second pass must add nothing.
7. If recent assignment history is missing, stop enrollment and invalidate affected analyses. Queue retention cannot reconstruct missing assignment authority.
8. Record measured restore-to-ready time, lost records, limitations, reviewer, and teardown evidence.

Day 7 uses a quiesced local `pg_dump`/`pg_restore`. It does not verify managed backups, PITR, encrypted storage, concurrent-write RPO, or cross-region recovery.
