# ExperimentOS operating contract

Status: **draft; unresolved values below block the corresponding deployment or traffic step**  
Recorded: 2026-10-22

`BUILD_IN_A_WEEK.md` remains authoritative. This document records its initial production assumptions and the decisions that must replace assumptions before they are relied upon.

## Initial supported boundary

| Dimension | Initial assumption | Current evidence/status |
| --- | --- | --- |
| Customer | One internal team integrating one real product | Product/team: **unknown** |
| Tenancy | One organization, isolated by project and environment | Organization/projects/environments: **unknown** |
| Deployment | One AWS region; separate staging and production resources | AWS account, region, and resource topology: **unknown** |
| Integration | Server-side TypeScript SDK and a real sample host application | Real host application and integration owner: **unknown** |
| Identity | Stable product-generated opaque subject ID; no identity merging | Namespace, generation, stability, and deletion behavior: **unknown** |
| Concurrency | One active experiment per project/environment | Project/environment definitions: **unknown** |
| Allocation | Two arms, fixed 50/50 within a fixed traffic percentage | Experiment traffic percentage: **unknown** and must be set prospectively |
| Outcomes | One binary primary metric and one binary guardrail | Metrics, event definitions, observability, and harm margin: **unknown** |
| Design | Fixed enrollment period, follow-up window, and analysis plan | Actual windows, allowance, baseline, MDE, alpha, power, and thresholds: **unknown** |
| Rollout | Human-approved product release; recommendations do not deploy code | Approver and external rollout system/reference format: **unknown** |
| Load envelope | Proposed acceptance target of 50 assignment requests/sec and 200 events/sec | **Unmeasured**; supported envelope must come from observed testing |
| Operations | A named owner receives alerts and can disable experimentation | Primary/backup owners, escalation route, and alert destination: **unknown** |

The proposed performance, availability, freshness, recovery, and disable values in the roadmap are targets, not guarantees. Single-region operation does not cover regional failure, and public multi-tenant SaaS is outside this initial contract.

## Reference implementation assumptions

- One repository and one backend codebase, with independently scalable API and worker processes.
- Next.js/TypeScript operator console; FastAPI/Pydantic/SQLAlchemy/Alembic backend; pinned NumPy/SciPy/statsmodels methods; server-side TypeScript SDK.
- PostgreSQL is the initial assignment authority. Events use an SQS standard queue and dead-letter queue, so workers must tolerate duplicate and out-of-order delivery.
- The reference AWS shape is ECS/Fargate, RDS PostgreSQL, SQS, Secrets Manager, CloudWatch, managed OIDC, Terraform remote state/locking, and GitHub Actions with short-lived deployment identity. These are planning defaults, not evidence of selected accounts or provisioned services.
- Assignment is synchronous; event ingestion and analysis are asynchronous. Separate pools and bounded concurrency must prevent event backlog from exhausting assignment capacity.

## Initial operational objectives

| Concern | Proposed objective | Current evidence |
| --- | --- | --- |
| Assignment availability | 99.9% monthly, including valid client timeouts | **Unmeasured** |
| Assignment latency | p95 below 100 ms and p99 below 250 ms at the declared envelope | **Unmeasured** |
| Durable event acceptance | 99.9% monthly; ambiguous retries reconcile by event ID | **Unmeasured** |
| Processing freshness | p95 accepted-to-materialized below 60 seconds | **Unmeasured** |
| Overload | Bounded concurrency/pools with explicit 429/503 behavior and retry guidance | **Unverified** |
| Database recovery | Proposed RPO at most 5 minutes and RTO at most 60 minutes | **Undrilled and unverified** |
| Emergency disable | At most 30 seconds for online hosts | **Unmeasured** |
| Integrity | No reassignment or duplicate analytical contribution in fault tests | **Untested** |

These values become supported claims only after realistic tests in the selected host region. A short test cannot establish a monthly availability record.

## Decisions required

| Area | Decision or evidence needed | Status |
| --- | --- | --- |
| Product | Name the host product/team, environments, first low-risk use case, and integration owner | **Unknown** |
| Data | Approve event allowlist, payload limits, prohibited data, pseudonymous-ID handling, residency, retention, deletion, export, backup, and incident requirements | **Unknown** |
| Identity | Define subject namespace and stability; confirm no merging; document missing-ID and deletion behavior | **Unknown** |
| Experiment | Prospectively choose primary metric, guardrail, acceptable harm margin, allocation/traffic, enrollment/follow-up/arrival windows, practical threshold, baseline, MDE, alpha, and power | **Unknown** |
| Cloud | Select authorized AWS account, region, staging/production topology, network approach, database availability/backup configuration, queue retention, and service quotas | **Unknown** |
| Identity provider | Select managed OIDC provider; define issuer, audience, groups/roles, MFA policy, administrators, and break-glass procedure | **Unknown** |
| Delivery | Identify source repository/CI environment, artifact registry, short-lived deployment identity, protected environments, approvers, and Terraform state/locking location | **Unknown** |
| Ownership | Name product, operations, security/privacy, cloud/billing, database/recovery, and statistical review owners, including backups and escalation paths | **Unknown** |
| Observability | Select telemetry destination, retention, paging rules, authorized test-alert recipient, SLO measurement method, and incident process | **Unknown** |
| Availability | Decide availability objectives and an availability topology consistent with them; decide whether assignment recovery needs more than database recovery | **Unknown** |
| Budget | Set monthly spend ceiling, budget owner, approval threshold, tags/cost allocation, and teardown policy | **Unknown** |
| Pricing | Verify current regional prices for compute, database, load balancer, network/NAT or private endpoints, observability, identity, backups, registry, and data transfer | **Unknown; no estimate recorded** |
| Traffic | Provide expected and peak assignment/event rates, payload sizes, database volume, retry behavior, growth, and realistic test profile | **Unknown; roadmap targets are not measurements** |
| Admission | Name the authority for staging, shadow, A/A, bounded A/B, and routine-service go/no-go decisions | **Unknown** |

No accounts, credentials, prices, owners, destinations, customer data, or production measurements are currently recorded. Secrets must be supplied through an approved secret system, never this file.

## Prerequisites

### Before Day 1 implementation can be verified

- Confirm supported local runtimes/package managers and establish reproducible build, lint, typecheck, migration, and test commands. None exist in the repository yet.
- Provide or approve an isolated local identity strategy whose shortcuts cannot operate in production.
- Make a PostgreSQL test environment and an explicitly identified local/emulated queue strategy available for integration tests.
- Confirm the target source-control/CI platform and the policy for dependency pinning, vulnerability review, and generated artifacts.
- Restore usable Git tooling if version-control checks are expected in this environment; the current `git` invocation is unavailable because Apple developer tools are not installed.

### Before any cloud plan or provisioning

- Resolve the cloud, network, availability, ownership, budget, pricing, Terraform state, deployment identity, security, data, backup, and retention decisions above.
- Obtain explicit authorization for the named account and region. Infrastructure definitions may be prepared first, but this contract grants no permission to create paid resources.
- Review the Terraform plan, estimated recurring/variable costs, quotas, secret boundaries, least-privilege roles, backup/PITR settings, and teardown/recovery procedures.

### Before staging deployment or real traffic

- Satisfy the roadmap's phase exit evidence and publish actual local versus managed-service verification separately.
- Deploy only to an authorized destination with named operators, tested alert routing, runbooks, rollback, isolated restore/replay evidence, and recorded RPO/RTO drill results.
- Complete independent statistical review before consequential decisions.
- Advance through staging, shadow, planned A/A, bounded low-risk A/B, and routine service as separate gates with immutable experiment IDs/plans and observed evidence.
- Do not use synthetic runs, a test clock, proposed targets, or a short observation period as evidence of production reliability or elapsed experiment duration.
