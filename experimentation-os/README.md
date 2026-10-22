# ExperimentOS

An experimentation platform intended for production use: stable assignment, durable event delivery, reproducible analysis, and auditable launch decisions.

**Current status:** planning. Application code and production infrastructure have not been implemented yet.

The [production roadmap](BUILD_IN_A_WEEK.md) owns the architecture, statistical contract, scope, operating targets, and release gates. This README provides the prompts to execute that roadmap.

## How to use these prompts

1. Open this project folder in Codex and paste **Prompt 0** once.
2. Paste the next daily prompt. Each prompt includes its own context and can be used in a new chat attached to this repository.
3. After implementation, paste **Verify the current phase** and review the evidence.
4. Use **Fix a failed checkpoint** when needed, then verify again.
5. Move to the next day when its implementation checks pass. Keep unresolved production admission gates visible.

The days represent phases, not a guarantee of elapsed time. Day 7 targets a staging release candidate; real traffic follows the roadmap's shadow, A/A, and bounded A/B admission gates. Experiment enrollment and follow-up take actual time.

These prompts request implementation, so Codex should carry out local work and verification, resolving routine technical choices along the way. Missing cloud access or external review should not block unrelated local progress. Actual cloud spending, publishing, or customer-data access must be within the user's authorized scope.

## Prompt 0 — Set up the project instructions

```text
Prepare this repository for implementing ExperimentOS.

Read BUILD_IN_A_WEEK.md, README.md, and any applicable AGENTS.md files. Inspect the actual repository; do not assume the planned application already exists.

Create or conservatively update only these planning files:
- AGENTS.md: concise durable instructions covering the product scope, architecture boundaries, correctness invariants, testing expectations, and where progress is recorded.
- docs/operating-contract.md: the roadmap's initial production assumptions, open product/cloud/ownership/budget decisions, and prerequisites. Mark unknown values explicitly; do not invent accounts, owners, prices, credentials, or traffic measurements.
- docs/implementation-status.md: one row per day showing not started/in progress/verified/blocked, observed verification evidence, and outstanding release gates. Include a short next-action section.

Keep BUILD_IN_A_WEEK.md authoritative for requirements and README.md authoritative for copy-paste prompts. Avoid copying the entire roadmap into AGENTS.md. Record real build/test commands when discovered; until then, label them unestablished.

Preserve existing files and unrelated work. Do not implement the application, install dependencies, provision resources, or mark any phase complete during this setup task.

Report the files created, assumptions, known prerequisites, and the next prompt to run.
```

## Day 1 — Foundation, environments, and identity

```text
Implement Day 1 of ExperimentOS using BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present.

Inspect the repository and briefly state the implementation approach, then carry out the local work. Preserve existing changes and resolve routine choices using the roadmap's initial contract.

Build:
1. The monorepo skeleton for the Next.js TypeScript console, FastAPI API, ingestion/analysis workers, server-side TypeScript SDK, and example host application.
2. Dependency lockfiles, local development configuration, container builds, and executable lint/typecheck/test commands.
3. PostgreSQL models and Alembic migrations for scoped projects/environments, credentials, experiments, immutable configurations/plans, assignments, events, snapshots, decisions, and audit records. Keep services beyond today's scope skeletal.
4. A typed OpenAPI boundary and frontend health connection.
5. Managed OIDC integration, server-enforced operator permissions, scoped service credentials with digest storage, and rotation/revocation primitives. Use an explicitly isolated local identity setup for testing; production must reject development authentication shortcuts.
6. Terraform definitions for isolated staging/production resources, managed database/queues, secrets, observability, remote state/locking, and budgets. Prepare a reviewable plan without creating paid resources unless authorized.
7. CI verification and container artifact builds.

Verify clean startup/migration, authentication failures, role restrictions, cross-environment denial, credential scope, and absence of secrets in browser bundles or logs. Run relevant tests and established build checks. Distinguish local/emulated verification from actual managed-service verification.

Do not build assignment behavior, event processing, statistics, or the full console yet. If external identity/cloud access is unavailable, implement the integration and local contract tests, record the actual verification gap, and continue unblocked work.

Update docs/implementation-status.md with actual commands, results, and remaining gates. Update AGENTS.md with established commands. Report what runs locally and what still depends on deployment access. Stop after this phase.
```

## Day 2 — Experiment lifecycle, assignment, and SDK

```text
Implement Day 2 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present. Inspect Day 1's actual implementation and resolve blocking local prerequisites within scope.

Build:
1. Minimal experiment setup, review, approval, and status UI backed by typed APIs.
2. Transactional lifecycle transitions, optimistic version checks, immutable approved configurations/analysis plans, and the one-active-experiment constraint per project/environment.
3. Assignment using validated pre-treatment eligibility, stable identity, independently domain-separated traffic/arm hashes, and persisted concurrency-safe uniqueness.
4. A documented canonical encoding/hash/bucket contract and cross-language golden vectors.
5. The server-side TypeScript SDK with bounded timeouts/retries, explicit unavailable/ineligible/out-of-traffic states, and documented safe fallback behavior.
6. An example host application that actually renders control or treatment from the SDK result.
7. Stop-new-enrollment and emergency-disable controls with permissions and transactional audit records.

Verify repeated/concurrent resolves, restart stability, allocation at multiple traffic percentages, frozen-field rejection, identity boundaries, unauthorized mutations, SDK timeout behavior, and actual host disable propagation. Returning unavailable must never fabricate a control assignment or exposure.

Do not implement statistics or the full event pipeline yet. Keep control-plane mutation authorization distinct from product service credentials.

Run relevant tests and required broader checks. Update docs/implementation-status.md with commands/results, measured behavior, and open gates. Provide a reproducible host integration walkthrough and stop after Day 2.
```

## Day 3 — Durable events and failure recovery

```text
Implement Day 3 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present. Use the real assignment and host integration already implemented.

Build:
1. Authenticated event collection with bounded schemas/payloads, timestamp checks, scoped assignment attribution, and allowlisted event types.
2. Durable queue publication, explicit per-item batch results, and HTTP 202 only for successfully published events.
3. A durable host outbox adapter, distinguishing locally persisted delivery from remote acceptance.
4. A worker that commits raw events, deduplication state, and derived contributions atomically before queue acknowledgement.
5. Conflicting-event-ID quarantine, order-independent reconciliation, bounded retries, visibility handling, dead-letter handling, and replay tooling.
6. Real exposure/outcome instrumentation in the host and correlation/receipt metrics.

Test duplicates, conflicting payloads, outcomes arriving before exposure, worker crashes before/after commit, ambiguous publication timeouts, partial batches, host restart with pending outbox, and dependency interruption. Assert at-most-one analytical contribution for retained event IDs. Test actual PostgreSQL transaction behavior; label emulated queue tests separately from live queue verification.

Queue acceptance must not imply final analytical inclusion. Do not claim exactly-once transport or crash survival for in-memory buffering.

Run relevant integration/fault tests and required broader checks. Update docs/implementation-status.md and document replay/dead-letter procedures. Report which failure scenarios were observed and stop after Day 3.
```

## Day 4 — Cohorts, data quality, and replay

```text
Implement Day 4 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present. Build on persisted assignments/events rather than hardcoded scenario values.

Build:
1. Assigned-subject cohorts, prespecified metric windows, binary user outcome facts, lateness policy, and deterministic attribution/exclusion reasons.
2. Assignment sample-ratio mismatch checks, separate exposure-loss diagnostics, freshness, and delivery completeness reconciliation by event identity/partition.
3. Finalization readiness requiring closed enrollment, mature follow-up, elapsed arrival allowance, and resolved relevant delivery/quarantine gaps.
4. Replay into a new derivation version with comparison against raw records before switching readers.
5. Isolated seeded A/A, benefit, guardrail-harm, inconclusive, SRM, and logging-outage scenarios using the real assignment/ingestion paths.
6. Console views for actual health, counts, progress, and exclusion reasons.

Verify missing exposure telemetry does not silently remove assigned users from the primary cohort. Test late/out-of-order outcomes, immature subjects, logging outages, missing partitions, replay reproducibility, and environment isolation. Missing outcome events count as zero only under the documented valid instrumentation contract.

Do not choose results or recommendations from scenario labels. Keep virtual clocks/synthetic data isolated to test/staging. Do not enable inferential launch decisions yet.

Run focused and required broader checks. Update docs/implementation-status.md, show a raw-record-to-display trace, and stop after Day 4.
```

## Day 5 — Statistics and auditable recommendations

```text
Implement Day 5 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, docs/implementation-status.md if present, and the cohort/finalization implementation.

Build:
1. Explicitly configured, pinned two-proportion score tests and compatible score-inversion confidence intervals, including validated sparse/degenerate behavior.
2. Rates, absolute differences in percentage points, relative lift when defined, and clearly labeled method settings.
3. Sample planning with explicit baseline/MDE units, allocation, alpha, and power; assess guardrail precision separately.
4. Prespecified guardrail non-inferiority and practical-primary-threshold semantics. Non-significant evidence of harm must not count as safety.
5. Ordered recommendations from the roadmap, including blocked/incomplete states, awaiting completion, final inconclusive, and eligibility for human launch approval.
6. Immutable snapshots recording plan/configuration/derivation/code versions, cutoff, source counts, checks, results, and caveats.
7. docs/statistical-methods.md with estimand, timing, assumptions, formulas/method options, thresholds, and review requirements.

Verify independent numerical fixtures, method/interval compatibility, zero/boundary cases, rule precedence, guardrail uncertainty, and snapshot reproducibility. Run seeded A/A false-positive, coverage, and power simulations with tolerances chosen before examining results. Report independent fixture provenance and Monte Carlo uncertainty; avoid circular tests that only call the same implementation twice.

Do not show confirmatory launch recommendations from incomplete cohorts, extend a completed inconclusive experiment to chase significance, or claim independent statistical review has occurred when it has not.

Run relevant and required broader checks. Update docs/implementation-status.md with numerical/calibration evidence and review gates. Stop after Day 5.
```

## Day 6 — Operator experience, monitoring, and load

```text
Implement Day 6 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present. Inspect the integrated host/API/worker/analysis path.

Build:
1. Complete operator setup, review, lifecycle, results, decisions, and audit views. Present freshness/validity before effects and show actionable loading/empty/error/partial-data states.
2. Human decisions linked to finalized snapshots, with rationale and external rollout reference. Recommendations must not deploy product changes.
3. Accessible forms, keyboard/focus behavior, responsive layouts, and status cues independent of color.
4. Metrics for assignment latency/errors, database saturation, queue age, processing freshness, quarantine, completeness, worker failures, and override state.
5. Actionable alerts routed to the named owner, with a test-delivery mechanism.
6. Nominal-load, overload, and dependency-failure profiles using real dependency behavior where available.

Verify operator and real host workflows, role/scope boundaries, credential revocation, deletion/invalidation effects, accessibility, bounded overload, and failure recovery. Measure achieved load, latency, errors, freshness, and resource use; distinguish proposed targets from actual measurements.

Run component/browser/integration checks appropriate to these changes. Test live alert delivery only to an authorized destination; otherwise record that gate as unverified and exercise a local test sink. Do not invent successful production measurements.

Update docs/implementation-status.md, publish reproducible load commands/results, and stop after Day 6.
```

## Day 7 — Release candidate and operational drills

```text
Implement Day 7 of ExperimentOS. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, docs/implementation-status.md if present, and all existing verification/release evidence.

Complete:
1. A browser workflow covering operator setup/approval, actual host assignment/events, finalized analysis under isolated test time, and snapshot-linked human decision.
2. Clean install/migration and upgrade checks against representative data volume.
3. Compatible application rollback to a previous image without unsafe schema reversal.
4. Backup restore into an isolated environment, test reconnection, assignment attribution recovery, replay, and count reconciliation.
5. Emergency-disable, dead-letter replay, credential rotation/revocation, and operator handoff drills.
6. Runbooks for deployment/rollback, backlog, ingestion outage, replay, credentials, emergency disable, restore, deletion, and analysis amendments.
7. docs/release-readiness.md listing each admission gate, evidence, measured RPO/RTO, known limitations, owner, and go/no-go outcome.

Run the established full verification/build suite and summarize actual evidence. Keep drills isolated and use authorized environments only. Prepare reviewable deployment artifacts; execute deployment only when its destination and spending are authorized.

Do not label a release production-ready because the week ended. Missing independent statistical review, failed recovery/identity checks, or unverified managed-service behavior remain explicit gates. Separate staging synthetic evidence from real shadow/A/A/A/B observation. Do not use a test clock to claim real experiment duration has elapsed.

Update docs/implementation-status.md and README startup/verification instructions to match implemented behavior. Report how to run the release candidate, remaining gates, and the next admission step. Stop after this phase.
```

## Verify the current phase

Paste this after any daily prompt:

```text
Verify the most recently implemented ExperimentOS phase using BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, docs/implementation-status.md, and the actual repository.

This is a verification task: inspect code and run relevant non-destructive checks without implementing fixes or starting the next phase. Confirm meaningful acceptance criteria and failure modes, not just file existence. Discover commands from the repository instead of inventing them. Distinguish passed, failed, and not-run checks; local/emulated evidence; real managed-service evidence; and external review requirements.

Report concrete findings ordered by impact, with file/line references where appropriate. For each failed or unverified criterion, state the observed evidence and smallest useful next action. State whether local implementation is ready for the next phase separately from production readiness. Do not claim success for commands that did not run.
```

## Fix a failed checkpoint

```text
Fix the concrete failures from the latest ExperimentOS verification report. Read BUILD_IN_A_WEEK.md, applicable AGENTS.md instructions, docs/implementation-status.md, and relevant code/tests first.

Reproduce failures where possible, identify the cause, implement the smallest sufficient correction, and add meaningful regression coverage for correctness failures. Preserve unrelated changes, required invariants, and external release gates. Do not weaken assertions or change the analysis plan merely to make tests pass. Do not add unrelated features or start the next phase.

Run focused verification plus required broader checks, update the status evidence, and report fixes and unresolved issues. Continue independent fixes if one item depends on missing external access or review.
```

## Resume in a new chat

```text
Continue building ExperimentOS in this repository. Read BUILD_IN_A_WEEK.md, README.md, applicable AGENTS.md instructions, and docs/implementation-status.md if present. Inspect actual implementation and verification evidence before deciding what is complete.

Continue the earliest unfinished implementation phase, preserving the production contract and unrelated work. Briefly state the current phase and next concrete action, then implement and verify the remaining work. Keep external admission gates distinct from coding progress. Do not repeat completed work or stop solely because one external gate is unavailable when useful local work remains. Update the status file and stop at the selected phase's boundary.
```

## Prompting reference

The phase structure, repository instructions, observable acceptance criteria, and verification reports follow the workflow conventions in [official OpenAI Codex guidance](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex). The prompts above are tailored to ExperimentOS and its production roadmap.
