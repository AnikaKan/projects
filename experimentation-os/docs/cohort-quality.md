# Cohort and pipeline-quality contract

This runbook covers the local Day 4 derivation boundary. `BUILD_IN_A_WEEK.md` remains authoritative.

## What the snapshot means

- The cohort is every eligible subject assigned during the frozen enrollment window. Missing exposure telemetry never removes an assigned subject.
- Each subject receives versioned binary facts for exposure, the frozen primary metric, and the frozen guardrail over the fixed follow-up window.
- Events before assignment, after the follow-up window, or arriving after the frozen arrival cutoff remain in raw storage and receive a versioned exclusion reason.
- A cohort snapshot is immutable. A replay uses a new `events-*` and `cohort-*` version; it never edits an earlier snapshot.
- The SRM result is a quality diagnostic using a documented 50/50 Pearson chi-square check with a 0.01 alert threshold and a 20-assignment minimum. It is not an efficacy test or recommendation.

## Finalization readiness

Every recorded readiness value must be true:

1. Enrollment is explicitly closed.
2. The assigned-subject cohort is non-empty.
3. Every subject's follow-up window is mature.
4. The frozen arrival-lateness allowance has elapsed.
5. Immutable source checkpoints cover the required interval without a missing partition.
6. The selected event derivation reconciles to every retained raw event.
7. Stored receipt event IDs reconcile to raw storage.
8. No relevant unresolved quarantine exists.
9. The prespecified allocation-balance diagnostic has not raised an SRM alert.
10. Emergency disable has not made a standard analysis inappropriate.

False outcome facts are derived for traceability, but they may support final analysis only after the instrumentation and pipeline-completeness gates pass. A logging outage therefore blocks finalization instead of silently turning missing events into successful zeros.

## Local operation

- Derive from the operator console with **Refresh pipeline quality**, or run `cd backend && uv run python -m app.workers.cohorts --experiment-id <uuid> --derivation-version <cohort-version>`.
- Verify the composed PostgreSQL behavior with `backend/.venv/bin/python scripts/verify_compose_day4.py` while the local stack is running.
- Investigate a blocked snapshot by reading its readiness values, pipeline coverage gaps, receipt reconciliation, quarantine count, freshness, exposure-loss rates, and raw/derived counts.
- Correct source data or reconciliation evidence; then derive a new version. Do not edit or delete an existing snapshot to make a gate pass.

## Production gaps

The source checkpoint producer, partition convention, retention/deletion policy, freshness objective, alert destination, operational owner, and exception authority are **unknown**. Local synthetic checkpoints are test evidence only. Managed queue/database behavior, real logging-outage detection, real alert delivery, load, and a real-host reconciliation period remain unverified.
