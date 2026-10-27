# Day 7 release readiness

Decision date: 2026-10-27  
Candidate: `day7-local-rc1`  
Admission decision: **NO-GO for staging, production, or real traffic**  
Permitted use: local synthetic demonstration only

This is an evidence register, not a production-readiness claim. The local release
candidate completed the authorized zero-spend drills, but the project has no
authorized hosted destination, named operators, managed-service evidence, or real
alert route.

## Local release gates

| Gate | Result | Observed evidence |
| --- | --- | --- |
| Browser workflow | Passed locally | The server-rendered console showed finalized evidence and the immutable decision form, then rendered the synthetic `reject_launch` decision and its unique rationale. The finalized analysis was intentionally inconclusive and no rollout occurred. |
| Actual assignments and events | Passed locally | The Day 7 drill created 200 assignments and 401 accepted synthetic event envelopes through the real API/worker path. The previously verified example host path is unchanged; a fresh rerun was blocked by an existing local `enrollment_closed` demo experiment, which was preserved rather than altered. |
| Clean migration | Passed locally | A disposable PostgreSQL database reached Alembic revision `e8f1a6c2d904` in 10.112 seconds before representative synthetic records were added. |
| Backup and restore | Passed locally | A quiesced logical backup restored into a separately named database. Source and restore both contained 240 assignments, 460 raw events, 460 contributions, 401 receipts, and zero quarantined events. |
| Recovery objective observation | Passed only for this drill | Quiesced-backup observed data loss was zero; restore-to-ready time was 4.485 seconds. These are local measurements, not production RPO/RTO commitments. |
| Compatible rollback | Passed locally | The API moved from the Day 7 candidate to the preserved Day 6 image without reversing the schema. It became ready in 4.719 seconds and returned the same assignment ID and arm. |
| Replay and dead letter | Passed locally | One synthetic failed envelope was observed in the emulated dead-letter queue, moved to the main queue, and reconciled once. Replaying 401 retained events twice into one new derivation stayed idempotent. |
| Credentials | Passed locally | Rotation preserved assignment attribution; the old credential was denied; the replacement was later revoked and returned 401. |
| Emergency disable | Passed locally | Disable returned the explicit `disabled` assignment state; no control assignment was fabricated. |
| Operator handoff | Passed locally | A synthetic handoff actor delivered an alert to the local database test sink and its action appeared in the audit history. No real person or external destination was contacted. |
| Locked backend checks | Passed | Ruff format/lint passed 66 files, mypy passed 34 source files, and pytest passed 46 tests. |
| Typed console build | Passed | The refreshed OpenAPI boundary and console completed generation, formatting, lint, TypeScript checking, compilation, page generation, and production optimization in Docker. |

The machine-readable measurements are in `docs/day7-drill-results.json`. Operational
procedures are indexed in `docs/runbooks/README.md`.

## Production admission gates still open

- Cloud provider, region, accounts/projects, hosted identity provider, and public
  deployment destination: **Unknown and not authorized**.
- Primary operator, backup operator, security owner, data owner, statistical
  reviewer, release approver, and incident escalation route: **Unknown**.
- Budget beyond the selected `$0` ceiling: **Not authorized**.
- Managed database, queue, backup/PITR, restore, encryption, key rotation, remote
  Terraform state, and cross-environment isolation evidence: **Not observed**.
- External alert delivery and operator acknowledgement: **Not observed**.
- Representative production volume, payload distribution, sustained load,
  availability, and cost: **Unknown**.
- Independent statistical review: **Not completed**.
- Subject deletion workflow: **Not implemented**; the runbook blocks manual SQL
  deletion and records the missing product capability.
- Hosted CI for the Day 7 public commit: **Pending until the commit exists and a
  workflow run is observed**.
- Shadow, A/A, bounded low-risk A/B, and routine-service admission gates: **Not
  started**. Synthetic test time and data cannot satisfy these elapsed-time gates.

## Supported local limits

- One organization in the local demonstration; project/environment scoping remains
  enforced by the API.
- PostgreSQL and LocalStack run on one developer laptop. This is not high
  availability and does not test independent failure zones.
- The representative Day 7 drill volume is 240 total assignments and 460 raw event
  records after combining the host-style and mature-analysis fixtures. No larger
  capacity claim is made.
- The recorded RPO/RTO observations apply only to a quiesced logical backup on this
  machine. Concurrent-write recovery and point-in-time recovery were not tested.

## How to change the decision

Keep the decision at **NO-GO** until every applicable open gate has an identified
owner, an authorized destination, an evidence link, and a reviewer sign-off. The
first eligible next admission step is an isolated staging review—not production or
real traffic—and it requires explicit authorization because zero-spend mode remains
in force.
