# ExperimentOS implementation status

Last updated: 2026-10-22  
Overall state: **not started (planning only)**

Observed repository evidence: `BUILD_IN_A_WEEK.md` and `README.md` are the only pre-existing files. There is no application scaffold, dependency manifest, lockfile, test suite, infrastructure definition, CI configuration, or Git metadata in this directory. Build, start, lint, typecheck, migration, test, infrastructure-plan, load-test, and deployment commands are **unestablished**. No application, cloud, or production claims have been verified. The system `git` command could not run because Apple developer tools are not installed.

## Phase status

| Day | Scope | State | Observed verification evidence | Outstanding phase/release gates |
| --- | --- | --- | --- | --- |
| 1 | Foundation, environments, identity | **Not started** | Planning documents only; no code, commands, migrations, identity integration, CI, containers, or infrastructure plan observed | Operating decisions; scaffold and pinned dependencies; startup/migration; authorization and scope-negative tests; secret checks; reviewed cloud plan; managed identity/cloud evidence |
| 2 | Lifecycle, assignment, SDK, real host behavior | **Not started** | No Day 1 implementation or Day 2 artifacts observed | Immutable/audited lifecycle; one-active constraint; stable concurrent assignment; independent hashes/golden vectors; explicit fallback; host behavior; disable propagation |
| 3 | Durable events and failure recovery | **Not started** | No collector, durable queue, host outbox, ingestion worker, raw store, quarantine, replay, or fault-test evidence observed | Durable acceptance semantics; atomic deduplication/contribution; conflict quarantine; out-of-order handling; crash/redelivery/partial-batch/outbox recovery evidence; live queue verification |
| 4 | Cohorts, quality, and replay | **Not started** | No persisted assignment/event pipeline, cohort derivation, completeness checks, scenarios, or UI evidence observed | Assigned-subject cohort; windows/lateness; SRM and exposure diagnostics; partition/identity reconciliation; finalization gates; versioned replay; environment isolation |
| 5 | Statistics and auditable recommendations | **Not started** | No statistics implementation, immutable snapshot, numerical fixture, simulation, or methods document observed | Pinned compatible methods; sparse cases; planning and guardrail semantics; precedence rules; independent numerical checks; calibrated simulations; independent statistical review |
| 6 | Operator workflow, monitoring, and load | **Not started** | No console workflow, telemetry, alert, accessibility, authorization, deletion, or load-test evidence observed | End-to-end operator/host workflow; snapshot-linked decisions; accessibility; alert delivery; revocation/scope/deletion tests; measured nominal/overload/failure behavior |
| 7 | Release candidate and operational drills | **Not started** | No deployed staging candidate, release artifacts, runbooks, restore, rollback, replay, handoff, or drill evidence observed | Clean install/upgrade; compatible rollback; isolated restore and assignment recovery; measured RPO/RTO; operational drills; release record; authorized staging deployment and gate decision |

## Production admission gates

All gates are outstanding. Gate 0 requires implemented and verified staging artifacts; Gates 1–4 then require, in order, real-host shadow evidence, a prospectively planned real A/A, one bounded low-risk A/B, and mature operated-service evidence. Passing a development phase does not advance an admission gate automatically.

Open cross-cutting gates include named owners and approvers; resolved cloud, identity, data, retention, budget, and traffic contracts; measured service/load behavior; verified managed-service semantics; alert delivery; restore/replay/rollback evidence; incident and operational runbooks; independent statistical review; and real observation periods.

## Next action

Run the README's **Day 1 — Foundation, environments, and identity** prompt. First resolve the local choices needed to scaffold and test without provisioning paid resources, then implement only Day 1, execute the commands the new tooling actually defines, and replace this planning-only evidence with exact results while leaving external gates open.
