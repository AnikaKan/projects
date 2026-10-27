# Subject deletion

Primary owner: **Unknown**  
Backup owner: **Unknown**

Status: **not implemented; production release blocker**.

The current schema intentionally uses restrictive attribution/provenance links. Deleting assignment or event rows directly would break auditability and may silently change a finalized analysis.

Required future procedure:

1. Authenticate and authorize the request; resolve the product identity to the scoped ExperimentOS subject without exposing it in logs.
2. Inventory assignment, raw, derived, quarantine, outbox, backup, and snapshot references under an approved retention/legal policy.
3. Choose an approved deletion or irreversible pseudonymization method and record its version.
4. Invalidate every affected non-final/final analytical artifact before recomputation. Never mutate a finalized snapshot in place.
5. Recompute into new derivation/analysis versions when legally and statistically valid; otherwise mark the experiment unusable.
6. Verify the identity is absent from every required live store and document backup-expiry handling.

No operator should execute manual SQL deletion until product, privacy, legal, statistical, and database owners approve this contract.
