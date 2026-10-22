# ExperimentOS: Production Infrastructure Roadmap

## Goal and delivery boundary

Build an experimentation service that a real product can integrate with and operate: controlled configuration, stable assignment, durable events, reproducible analysis, accountable decisions, and recoverable deployments.

The first seven days target a release candidate in staging. Admission to real traffic depends on passing the release gates below. A week is an aggressive implementation target for an experienced builder using managed services; it cannot establish long-term reliability or shorten experiment enrollment and follow-up. Allow further time for product integration, independent statistical review, recovery drills, and observed operation. Failed gates carry forward beyond the week.

This replaces the portfolio-oriented plan. It is a proposed specification, not evidence of implemented infrastructure. The repository currently contains planning documentation only.

## Initial production contract

Use these assumptions until actual product requirements replace them:

| Dimension | Initial supported boundary |
| --- | --- |
| Customer | One internal team integrating one real product |
| Tenancy | One organization, with project and environment isolation |
| Deployment | One AWS region; separate staging and production resources |
| Integration | Server-side TypeScript SDK and a real sample host application |
| Identity | Stable product-generated opaque subject ID; no identity merging |
| Concurrency | One active experiment per project/environment |
| Allocation | Two arms, fixed 50/50 within a fixed traffic percentage |
| Outcomes | One binary primary metric and one binary guardrail |
| Design | Fixed enrollment period, follow-up window, and analysis plan |
| Rollout | Human-approved product release; recommendations do not deploy code |
| Load envelope | Target 50 assignment requests/sec and 200 events/sec, then measure |
| Operations | Named owner receives alerts and can disable experimentation |

These load numbers are proposed acceptance targets, not measured capacity. Declare only the envelope demonstrated in testing. Single-region deployment does not cover a regional outage. Public multi-tenant SaaS requires a subsequent design.

Before provisioning, record the host application, cloud account/region, operational owner, allowed data, expected load, and monthly spend ceiling in docs/operating-contract.md. Verify current provider pricing. Include compute, database, load balancer, network/NAT or private endpoints, observability, identity, and backups. Preparing infrastructure definitions can proceed before creating paid resources.

## Revised product flow and feedback

The original assignment/events/statistics/decision pillars remain useful. Production requirements change their order and acceptance criteria.

1. Provision project/environment access for operators and product service clients.
2. Integrate a real host application; verify instrumentation through shadow operation and A/A.
3. Draft and freeze the hypothesis, identity, allocation, metrics, timing, and analysis plan.
4. Approve and launch an immutable configuration version.
5. Resolve assignment immediately before the host treatment decision.
6. Record actual exposure separately; ingest outcomes durably and asynchronously.
7. Monitor delivery, cohort integrity, sample balance, and service health.
8. Close enrollment on schedule; allow follow-up and late arrivals to finish.
9. Finalize a reproducible snapshot against a verified data cutoff.
10. Save a human decision and rollout reference, retaining its configuration and evidence.

The dashboard puts freshness and validity before effects. Operators need enrollment-stop and emergency-disable controls independent of the results screen.

Three corrections to the previous plan matter:

- An analysis restricted to exposed users is not automatically intent-to-treat. If exposure depends on treatment, selecting on it can bias the result.
- A non-significant crash increase does not demonstrate safety. Define an acceptable harm margin and require sufficient evidence to exclude worse harm.
- A completed inconclusive fixed-horizon experiment should not say “continue testing” indefinitely. Further confirmatory collection needs a new prospective plan.

Microsoft's experimentation research describes how filtering and logging conditions can create biased experiment samples and sample-ratio mismatches. That informs the separate assignment, exposure, and delivery diagnostics here. [SRM diagnosis and analysis filtering](https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/)

## Architecture

Keep one repository and one backend codebase. Deploy independently scalable API and worker processes from that codebase.

~~~text
Authenticated operators -> Next.js console -> management API
                                                 |
                                             PostgreSQL
                                                 ^
Product -> TypeScript SDK -> assignment API ------|
       \-> event collector -> SQS -> ingestion worker
                                       |
                                  raw events / user facts
                                       |
                                  analysis worker
                                       |
                                  immutable snapshots
~~~

Assignment remains synchronous. Event processing runs asynchronously. Separate connection pools and bounded concurrency prevent an event backlog from exhausting assignment capacity.

At the initial load envelope, PostgreSQL persistence is the assignment authority. Use indexed transactions and measure before introducing cache consistency concerns. A durable queue, independent worker, and replayable raw data are required from the start.

| Concern | Recommended implementation |
| --- | --- |
| Console | Next.js, TypeScript, Tailwind, accessible components, Recharts |
| API/worker | FastAPI, Pydantic, SQLAlchemy, Alembic, Python |
| Statistics | Pinned NumPy, SciPy, statsmodels |
| Database | Managed PostgreSQL, automated backups and point-in-time recovery |
| Event buffer | SQS standard queue and dead-letter queue |
| Runtime | Containerized console, API, ingestion worker, analysis job |
| Reference AWS deployment | ECS/Fargate, RDS PostgreSQL, SQS, Secrets Manager, CloudWatch |
| Operator identity | Managed OIDC provider; MFA for privileged access |
| Infrastructure | Terraform with encrypted remote state and locking |
| CI | GitHub Actions; short-lived cloud deployment identity |
| Tests | Pytest, Vitest, Playwright, load and fault tests |

AWS is a planning default, not an existing account selection. Set production availability topology and spend from the operating contract. Use at least two API tasks across zones and a database availability configuration consistent with the objective before claiming zone-failure tolerance.

SQS standard queues allow duplicates and out-of-order messages; worker correctness must cover both. [AWS queue semantics](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html)

Suggested repository:

~~~text
frontend/                 operator console
backend/app/api/          management, assignment, collection
backend/app/domain/       lifecycle, policy, assignment
backend/app/workers/      ingestion, reconciliation, analysis
backend/app/stats/        pinned methods and plan validation
backend/app/db/           models, repositories, migrations
backend/tests/            unit, PostgreSQL integration, faults
packages/sdk-node/        server-side product integration
examples/host-app/        treatment rendering and instrumentation
infra/terraform/          separate environments and operations
tests/e2e/                operator and product workflows
tests/load/               profiles and measured results
docs/                     specifications, runbooks, release evidence
.github/workflows/        verification and deployment
~~~

## Access, isolation, and persistence

### Access controls

- Operator roles: viewer, editor, approver, administrator. Enforce permissions on server reads, mutations, exports, and jobs.
- Validate OIDC signature, issuer, audience, expiry, and membership. Protect browser sessions and state-changing requests.
- Scope service credentials to project/environment and capabilities such as assignment or event ingestion. Store key digests, support rotation/revocation, and never put server credentials in browser code.
- Derive authority from credentials. Request fields cannot choose an unauthorized project or environment.
- Include scope in queries and uniqueness constraints. Test cross-environment denial within the single organization.
- Separate runtime, migration, and backup permissions. Keep secrets out of source, bundles, traces, and logs.

### Entities and invariants

| Entity | Essential invariant |
| --- | --- |
| Project/environment | Scope for credentials, experiments, events, snapshots, audits |
| Experiment | Stable identity, owner, lifecycle, active configuration version |
| Configuration version | Immutable after approval; audience, salt, allocation, algorithm version |
| Analysis plan | Frozen metrics, estimand, windows, thresholds, methods, timings |
| Assignment | Unique scoped experiment/subject; arm, configuration, assignment time |
| Raw event | Scoped unique event ID, payload hash, assignment, occurrence/ingestion times |
| User fact | Deterministic binary outcome per assigned subject, metric, and window |
| Receipt/quarantine | Delivery identity, validation status, failure reason, replay status |
| Analysis snapshot | Plan/code versions, cutoff, source counts, checks, results |
| Decision | Snapshot, actor, rationale, action, product rollout reference |
| Audit record | Actor, scope, action, time, configuration digest or change detail |

Write critical mutations and their audit entries transactionally. Runtime roles cannot update/delete audit history. Protect privileged database access and export audits to separately protected storage; application immutability alone is not tamper-proofing against administrators.

Use schema versions, UTC, correlation IDs, bounded payloads, and stable errors. Accept opaque identifiers and allowlisted properties rather than arbitrary personal data. Pseudonymous identifiers remain sensitive. Define retention and deletion across raw records, derived facts, queues, exports, and backups. Deleting source data marks affected snapshots invalidated instead of silently presenting unchanged evidence.

## Experiment lifecycle and assignment

Lifecycle:

~~~text
draft -> approved -> running -> enrollment_closed -> finalizing -> completed -> archived
                         \-> stopped (emergency action)
~~~

Approval records the actor and configuration digest. Launch uses a transaction and optimistic version check. Enforce one active experiment per project/environment in the database.

Freeze allocation, eligibility definition, identity namespace, salt, hash algorithm, metrics, follow-up windows, enrollment end, lateness policy, and analysis settings. A material change starts a new experiment. Emergency stops record the reason and invalidate an ordinary confirmatory efficacy claim.

Assignment algorithm:

1. Authenticate scope and check the active configuration/operational state.
2. Return an existing assignment before reevaluating mutable request attributes.
3. For a new subject, evaluate frozen eligibility using validated pre-treatment attributes.
4. Use independently domain-separated hashes for traffic inclusion and arm assignment. Reusing one bucket range biases allocation at some traffic percentages.
5. Specify canonical input encoding, hash, salt, bucket mapping, and algorithm version. Publish cross-language golden vectors.
6. Insert an authoritative assignment under a unique constraint; concurrent requests return the winning row.
7. Return assignment ID, arm, configuration version, and verifiable assignment token for attribution.

Reject missing identity instead of generating a random visit identity. Identity merging and mid-experiment allocation changes are outside the first release.

Failure semantics:

- An SDK timeout yields an explicit unavailable result, never a fabricated control assignment.
- A host may honor an already persisted assignment under the documented policy. New subjects use a preconfigured safe fallback and are not enrolled when assignment is unavailable.
- Record fallback behavior separately from valid experimental exposure.
- Stop-new-enrollment preserves existing assignments. Emergency disable overrides rendering, records contamination, and blocks a standard final recommendation.
- Initial online resolves check operational state. Measure override propagation in the host; do not cache disable state indefinitely.
- An unreachable process cannot receive an immediate kill command. Its predeclared failure policy is part of the integration contract.

## Durable event collection and reconciliation

Each event carries event ID, schema version, assignment ID/token, event type, occurrence time, source identity, and correlation ID. Use allowlisted event fields.

Collector behavior:

1. Authenticate and validate schema, scope, token, payload size, and timestamp bounds.
2. Publish to durable storage.
3. Return HTTP 202 only for successfully published events. Batch replies identify individual success/failure.
4. Queue acceptance means durable receipt, not final analysis membership.
5. On ambiguous publication timeouts, retry the same event IDs.

Do not promise exactly-once transport. For retained IDs, guarantee at-most-one stored semantic event and analytical contribution. A repeated ID with a different payload is quarantined as a conflict.

An in-memory SDK buffer cannot survive a host crash. Implement a durable outbox adapter for host integrations that require that survival and test it in the example application. Clearly distinguish “stored in host outbox” from “accepted by ExperimentOS.”

Worker behavior:

- Commit raw event, deduplication state, and derived contribution atomically before acknowledging the queue message.
- Redelivery after commit must not count twice.
- Retain and reconcile outcomes arriving before exposure. Processing order must not determine metric membership.
- Validate authoritative assignment/configuration; quarantine invalid records with reasons.
- Extend visibility as needed, retry transient failures, and dead-letter persistent failures.
- Alert on queue age, retries, dead letters, quarantine, and reconciliation delay.
- Configure retention for the documented maximum outage/recovery period and alert before expiry.
- Maintain receipt/checkpoint reconciliation by event ID or partition, not just matching global counts.
- Replay raw data into a new derivation version; compare before switching readers.
- Never mutate a finalized snapshot during replay or late-data handling.

Retain raw records and their derivation version under the declared retention policy. Schedule reconciliation by project, experiment, arm, and time partition.

## Statistical specification

### Cohort and timing

- Randomization unit: stable subject, assigned immediately before the treatment decision.
- Primary cohort: all eligible assigned subjects during the fixed enrollment period, including subjects without subsequent exposure telemetry.
- Exposure is a separate compliance/logging diagnostic. Selecting the primary cohort on exposure requires additional causal assumptions and review.
- Outcome: at least one valid event in the prespecified follow-up window after assignment, attributed to the recorded arm.
- Example timing: seven-day enrollment, 24-hour follow-up, then 24-hour arrival allowance. Actual product windows are set prospectively.
- Missing outcome events count as zero only under a verified instrumentation contract. Logging outages and missing pipeline partitions block finalization.
- Guardrail: binary crash incidence per assigned subject within its fixed window. If crashes cannot be reliably observed, choose a guardrail with trustworthy instrumentation.
- Retain out-of-window data with exclusion reasons. Late arrivals after cutoff produce an amended snapshot, not an invisible rewrite.

Finalization requires closed enrollment, mature follow-up, elapsed lateness allowance, queue/reconciliation completeness through the cutoff, and no unresolved relevant delivery/quarantine cases. Display each readiness state.

### Methods and planning

- One primary binary metric, one binary guardrail, two arms, and a locked fixed-duration analysis plan.
- Report counts, rates, absolute difference in percentage points, and relative lift when defined.
- Use an explicitly configured two-proportion score test and compatible score-inversion interval. Pin library version, method, and correction settings.
- Proposed primary alpha: 0.05, two-sided. Store the chosen settings in the plan.
- Plan sample needs using baseline, absolute MDE, allocation, alpha, and desired power. Separately assess guardrail precision. Label approximations and check their calibration.
- State MDE units: moving 20% to 22% is 2 percentage points and 10% relative lift.
- Sparse/degenerate cases return insufficient information when the validated method is unsupported; never invent zero-width confidence intervals or silently choose a different method after seeing data.
- Monitor assignment SRM against planned allocation using a prespecified diagnostic threshold, initially proposed as 0.01. Analyze exposure loss separately.
- Repeated quality alerts are operational diagnostics, not efficacy significance claims.
- Ongoing outcome views are descriptive. Confirmatory recommendations require finalization.
- A safety stop is allowed, but its interruption changes what efficacy claims are supported.
- Do not extend an inconclusive completed study to chase significance. New confirmatory data requires a new prospective plan.

The statistical library provides independent-proportion tests and intervals, but choosing explicit methods and validating the entire design remains necessary. [Test documentation](https://www.statsmodels.org/stable/generated/statsmodels.stats.proportion.test_proportions_2indep.html), [interval documentation](https://www.statsmodels.org/stable/generated/statsmodels.stats.proportion.confint_proportions_2indep.html)

### Safety and recommendation policy

Define a maximum acceptable crash-rate increase before launch. Require the upper confidence bound on treatment-minus-control risk to be below that margin to call the guardrail acceptable. Non-significant evidence of harm is not sufficient evidence of safety.

| Evidence/state | Recommendation |
| --- | --- |
| Delivery gap, SRM, invalid attribution, plan violation | Investigate; block launch recommendation |
| Emergency stop or confirmed harmful effect | Do not launch based on this experiment |
| Enrollment, follow-up, or arrival allowance still open | Await planned completion |
| Final sample/precision insufficient | Inconclusive; no launch recommendation |
| Positive primary evidence, practical criterion met, guardrail acceptable, validity passes | Eligible for human launch approval |
| Significant primary degradation | Do not launch |
| Completed study without sufficient evidence | Inconclusive; new plan for further confirmatory testing |

Define practical-threshold semantics prospectively. An estimate above a target is not proof the true effect exceeds that target. If that proof is required, test against the target or require the lower interval bound above it.

Independent review must cover estimand, timing, planning, guardrail policy, multiplicity, numerical edge cases, and calibration before consequential decisions. New metrics/variants need a revised multiplicity design. Recommendations do not trigger automated rollouts.

## Operations and release evidence

Proposed targets must be measured from the host region under realistic concurrency, payloads, database volume, and retries:

| Concern | Initial target/evidence |
| --- | --- |
| Assignment availability | 99.9% monthly objective; include valid client timeouts |
| Assignment latency | p95 <100 ms, p99 <250 ms at the declared envelope |
| Durable event acceptance | 99.9% monthly objective; ambiguous retries reconcile by ID |
| Processing freshness | p95 accepted-to-materialized <60 seconds |
| Overload | Bounded concurrency/pools; explicit 429/503 and retry guidance |
| Database recovery | Proposed RPO <=5 minutes, RTO <=60 minutes; measure in drill |
| Emergency disable | Target <=30 seconds for online hosts; verify integration |
| Integrity | No observed reassignment or duplicate analytical contribution in fault tests |

These are objectives, not present guarantees. A week cannot establish monthly availability. Report drill results, short observation periods, and ongoing SLO measurements separately.

Backups and point-in-time recovery need verified restorable history and an actual restore drill. [PostgreSQL PITR documentation](https://www.postgresql.org/docs/current/continuous-archiving.html)

A database RPO can lose recent assignment rows. Queue retention alone does not recover them. Test assignment/event attribution after restore using retained tokens and independent recovery records. If recent history cannot be reconstructed, stop enrollment and invalidate affected analyses rather than reassign subjects. A product requiring zero-loss assignment history needs an additional independently durable recovery design before admission.

Required runbooks: deploy/rollback, backlog, ingestion outage, dead-letter replay, credential rotation/revocation, emergency stop, database restore, subject deletion, and analysis amendment. Each names an owner and concrete verification steps.

## Seven-day implementation sequence

This is a dependency order with acceptance gates. Carry unfinished work forward; simplify UI breadth before removing reliability requirements.

### Day 1 — Contract, environments, identity

1. Verify prerequisites and repository instructions.
2. Record the operating contract, cost estimate, dependencies, and owner.
3. Scaffold console, API, worker, SDK package, host example, and CI.
4. Define schema/migrations, OpenAPI boundary, immutable configuration, and analysis plan.
5. Prepare isolated infrastructure, remote state, secrets, and container artifacts.
6. Integrate OIDC roles, server permissions, and scoped service credentials.

Deliverable: authenticated staging skeleton and explicit deployment contract.

Exit evidence: clean migration/startup; unauthorized/cross-environment denial; no secrets in bundles/logs; pinned dependencies; reviewed infrastructure plan. Missing cloud access remains a deployment dependency while local work proceeds.

### Day 2 — Lifecycle, assignment, real SDK integration

1. Build minimal setup/review/approval UI and versioned API.
2. Implement transactional lifecycle and frozen approved plans.
3. Implement independent traffic/arm hashing, targeting, sticky concurrency-safe assignment.
4. Add SDK golden vectors, timeouts, retries, and typed fallback behavior.
5. Make assignment change real behavior in the sample host.
6. Add enrollment stop, emergency disable, and audit trail.

Deliverable: operator launches an experiment; product renders its assigned behavior.

Exit evidence: concurrency, restart stability, traffic-level allocation, frozen-field rejection, fallback behavior, and measured disable propagation.

### Day 3 — Durable ingestion and failure handling

1. Implement authenticated collection, durable acknowledgements, batch receipts.
2. Add host outbox, worker deduplication, and conflicting-ID quarantine.
3. Commit event/fact updates before queue acknowledgement.
4. Add out-of-order reconciliation, retry, dead-letter, replay, and metrics.
5. Instrument real exposures/outcomes in the host.

Deliverable: assignment-to-outcome path survives retries and worker restarts.

Exit evidence: kill before/after commit, redelivery, reordering, ambiguous publication, partial batches, host restart with outbox. No false success and no duplicate count.

### Day 4 — Cohorts, quality, replay

1. Implement assigned-subject cohorts and fixed windows.
2. Add SRM, exposure-loss, freshness, and completeness checks.
3. Implement finalization readiness.
4. Replay into versioned derived tables and reconcile.
5. Add isolated A/A, benefit, harm, inconclusive, SRM, and logging-outage scenarios.
6. Display actual pipeline health, sample progress, and counts.

Deliverable: traceable counts and quality states.

Exit evidence: replay matches raw records; missing partitions, immature cohorts, and pipeline gaps prevent finalization. Virtual clocks and synthetic data are isolated to test/staging environments.

### Day 5 — Statistics and reproducible recommendations

1. Implement pinned score-test/interval settings and sample planning.
2. Add independent numeric fixtures and sparse/degenerate behavior.
3. Implement guardrail non-inferiority and final inconclusive handling.
4. Persist plan/code/image versions, cutoff, checks, and results in snapshots.
5. Run seeded A/A false-positive, coverage, and power calibration with prespecified tolerances.
6. Write the statistical specification for independent review.

Deliverable: versioned analysis for mature, complete cohorts.

Exit evidence: numeric cross-checks, calibration report, no recommendations from incomplete data, explicit guardrail-uncertainty behavior. External statistical review can remain a release blocker after coding finishes.

### Day 6 — Operator workflow, monitoring, load

1. Finish setup/results/decision/audit views, including accessible failure states.
2. Save human decisions against finalized snapshots.
3. Instrument request errors/latency, database saturation, queue age, completeness, overrides.
4. Route actionable alerts and verify receipt by the operational owner.
5. Run nominal load, overload, and dependency-failure profiles.
6. Verify credential revocation, scope isolation, and deletion effects.

Deliverable: usable console and demonstrated operational response.

Exit evidence: integrated browser/host workflows, alert delivery, achieved load envelope, failure behavior, and authorization tests.

### Day 7 — Recovery, release candidate, admission decision

1. Verify clean installation and migration against representative volume.
2. Roll back to a previous image using a compatible schema.
3. Restore a backup into isolation, reconnect the test deployment, replay, reconcile.
4. Drill emergency stop, dead-letter replay, credential revocation, and operator handoff.
5. Publish CI artifacts, infrastructure plan, statistical evidence, runbooks, and release record.
6. Deploy the staging candidate and make a gate-based production admission decision.

Deliverable: reproducible operated release candidate, with honest blockers.

Exit evidence: measured RPO/RTO, assignment attribution after restore, replay correctness, rollback, named owner, and review status. Failed gates keep the release in staging while work continues.

## Production admission after implementation

| Gate | Allowed use | Evidence to advance |
| --- | --- | --- |
| 0: staging | Synthetic users and fault injection | CI, scopes, SDK integration, recovery/replay drills |
| 1: shadow | Resolve/log in real host without changing experience | Identity checks, source receipt reconciliation, freshness, operations observation |
| 2: real A/A | Identical behavior in both arms | Randomization/instrumentation validation over a planned observation period |
| 3: bounded A/B | One low-risk experiment, fixed enrollment | Reviewed plan, operator readiness, tested stop behavior, applicable gates passed |
| 4: routine service | More experiments within supported contract | Mature reconciled studies, observed reliability, incident/recovery readiness |

Use separate immutable experiment IDs/plans for shadow, A/A, and A/B. Do not edit a running A/A into an A/B. A/A non-significance alone does not prove calibration; combine field checks, simulation, and review.

Real experiments take real time. Seven-day enrollment plus one day of follow-up and one day of allowed arrivals means finalization no earlier than nine days after launch.

## Codex implementation prompts

For the complete, individually copyable prompts, including project setup, phase verification, fixes, and resuming work, use the [README prompt guide](README.md#how-to-use-these-prompts). The abbreviated prompts below remain a quick reference for this roadmap.

Use one phase per request. Local implementation can proceed from these prompts. Actual paid provisioning, publication, or customer-data access requires those actions to be in the user's authorized scope.

Common instruction:

~~~text
Read BUILD_IN_A_WEEK.md and applicable AGENTS.md files. Inspect existing code and preserve unrelated changes. Implement the selected day and necessary dependencies using the documented initial contract. Treat live code and executed checks as evidence, not plan claims. Add meaningful correctness and failure-mode tests. Run focused and required broader checks, fix failures, and report behavior, verification, and remaining release gates. Continue unblocked local work if deployment credentials or independent review are unavailable. Never equate passing unit tests with production readiness.
~~~

Day 1:

~~~text
Apply the common instruction to Day 1. Create the operating contract with marked assumptions, cost/deployment dependencies, monorepo skeleton, containers, schema/migrations, typed contracts, OIDC roles, scoped credentials, and CI. Prepare Terraform for isolated staging/production, managed data/queue services, secret handling, encrypted remote state, observability, and budgets. Verify startup, clean migrations, denied unauthorized access, and cross-environment boundaries. Prepare a reviewable infrastructure plan before paid provisioning.
~~~

Day 2:

~~~text
Apply the common instruction to Day 2. Implement approved immutable configuration, fixed analysis plans, transactional lifecycle, independent traffic/arm hashing, sticky concurrent assignment, SDK, and real host behavior. Add enrollment stop and emergency disable. Verify golden vectors, partial-traffic allocation, identity stability, concurrent uniqueness, restart, timeout/fallback behavior, and override propagation. Unavailable is not control.
~~~

Day 3:

~~~text
Apply the common instruction to Day 3. Implement scoped collection, durable publish receipts, batch partial failure, host outbox, idempotent worker transactions, conflicting-ID quarantine, reordering reconciliation, bounded retry, dead letters, and replay. Test crashes before/after commit, ambiguous publication, redelivery, reordering, host restart, and dependency interruption. Distinguish host-outbox persistence, queue acceptance, and analytical inclusion.
~~~

Day 4:

~~~text
Apply the common instruction to Day 4. Implement assigned-subject cohorts, prespecified outcome windows, lateness/cutoffs, assignment SRM, separate exposure-loss diagnostics, completeness reconciliation, and finalization readiness. Add isolated scenarios and versioned replay. Show actual freshness and counts. Test missing exposure telemetry, logging gaps, immature subjects, late/reordered outcomes, and missing partitions. Do not condition the primary denominator on exposure telemetry.
~~~

Day 5:

~~~text
Apply the common instruction to Day 5. Implement pinned explicit inference methods, compatible intervals, primary/guardrail planning, practical-threshold semantics, guardrail safety margins, insufficient-information cases, and snapshot provenance. Add independently checked numeric fixtures and seeded calibration, power, and coverage experiments. Document design and review gates. Non-significant harm does not establish safety. Completed inconclusive studies do not keep collecting confirmatory data without a new prospective plan.
~~~

Day 6:

~~~text
Apply the common instruction to Day 6. Complete operator flows, snapshot-linked human decisions, audits, accessibility/failure states, operational metrics/alerts, load tests, and access checks. Exercise the real host and console under nominal load, overload, and dependency failures. Report measured latency, errors, freshness, resource use, achieved envelope, alert delivery, revocation, and cross-environment denial.
~~~

Day 7:

~~~text
Apply the common instruction to Day 7. Build release artifacts and exercise clean migration, compatible rollback, isolated backup restore, assignment recovery, replay/reconciliation, emergency stop, and credential rotation. Measure recovery rather than assuming it. Complete runbooks and release evidence, prepare deployment to the authorized environment, and record the gate-based admission decision. Report actual dependencies and review blockers. Failed gates remain open beyond the week.
~~~

## Release checklist

- [ ] Real SDK integration affects host behavior and records exposure separately.
- [ ] Operator roles, service scopes, revocation, and environment isolation pass negative tests.
- [ ] Approved configuration and plans are immutable and audited.
- [ ] Assignment stays stable under concurrency, retries, restarts, and supported failures.
- [ ] Fallbacks/overrides are explicit and never fabricate experiment data.
- [ ] Accepted event identities reconcile through queue, raw storage, and derived facts.
- [ ] Duplication, conflicts, reordering, crashes, and outbox recovery pass tests.
- [ ] Cohort, windows, late data, and finalization are reproducible.
- [ ] Inference, stopping, guardrails, multiplicity, and calibration receive independent review.
- [ ] Numerical/calibration results meet prespecified tolerances.
- [ ] Decisions reference complete immutable snapshots.
- [ ] Supported latency/load/freshness envelope is measured.
- [ ] Alerts reach an owner and the host respects emergency disable.
- [ ] Backup restore, assignment attribution, replay, and rollback are demonstrated.
- [ ] Retention/deletion covers raw, derived, queued, exported, and backed-up data.
- [ ] Costs, scope, ownership, and admission decision are documented.

## Subsequent expansion

Expand from measured needs: configuration caching with defined invalidation; more SDKs and durable adapters; multiple concurrent experiments with exclusion/interaction controls; partitioned raw storage and analytical warehouse; multi-metric inference; sequential methods; external tenant isolation; regional failover; product release integration. Each expansion needs its own operational and statistical acceptance criteria.
