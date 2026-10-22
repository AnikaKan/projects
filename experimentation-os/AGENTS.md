# ExperimentOS repository instructions

## Sources of truth

- `BUILD_IN_A_WEEK.md` is authoritative for product requirements, architecture, phase boundaries, correctness criteria, and release gates.
- `README.md` is authoritative for copy-paste implementation and verification prompts.
- Record observed progress and evidence in `docs/implementation-status.md`; record operating assumptions and unresolved prerequisites in `docs/operating-contract.md`.
- Inspect the repository before each phase. Treat plans as requirements, never as evidence that code or infrastructure exists.

## Product and architecture boundaries

- Build the initially supported single-organization experimentation service: an operator console, one backend codebase deployed as independently scalable API and worker processes, a server-side TypeScript SDK, a real host example, PostgreSQL, and a durable event queue.
- Keep synchronous assignment isolated from asynchronous event ingestion and analysis. PostgreSQL is the initial assignment authority; queued delivery is not analytical inclusion.
- Keep project/environment scope explicit at authentication, query, uniqueness, audit, and job boundaries. Separate staging and production resources.
- Human operators approve product releases. Recommendations and analysis must never deploy product code automatically.
- Work one roadmap day at a time. Do not silently pull later-phase features forward or remove reliability requirements to meet the nominal schedule.

## Correctness invariants

- Approved configuration versions and analysis plans are immutable and audited. Enforce one active experiment per project/environment.
- Assignment is stable and concurrency-safe for a scoped experiment/subject. Traffic and arm selection use independently domain-separated hashes. Missing identity or assignment failure never fabricates a control assignment.
- Assignment, exposure, and outcome are distinct. The primary cohort is assigned subjects unless a prospectively reviewed design states otherwise.
- Event transport may duplicate or reorder. Retained event IDs contribute at most once; conflicting reuse is quarantined; raw data remains replayable; finalized snapshots are not mutated.
- Finalization requires mature follow-up, elapsed lateness allowance, and verified delivery/reconciliation completeness. Missing or invalid evidence blocks recommendations.
- Guardrail safety requires the prespecified harm-margin evidence; non-significant harm is not proof of safety. Inconclusive fixed-horizon studies require a new prospective plan for further confirmatory data.
- Preserve immutable provenance for analysis and human decisions. Keep secrets and personal data out of source, browser bundles, traces, and logs.

## Verification expectations

- Add tests for meaningful behavior, negative authorization/scope paths, concurrency, retries, faults, numerical edge cases, recovery, and the phase-specific acceptance criteria in the roadmap.
- Prefer real PostgreSQL transaction tests and clearly distinguish local/emulated evidence from managed-service evidence. Never infer production readiness from unit tests or file presence.
- Record the exact command, result, environment, and relevant measurement for executed checks. Do not mark a day verified while required evidence or a phase exit criterion is missing.
- Preserve unrelated work. Do not provision paid resources, publish artifacts, contact real traffic, or access customer data without explicit authorization and an identified destination.

## Commands and progress

- Build, start, lint, typecheck, migration, test, infrastructure-plan, load-test, and deployment commands are **unestablished** as of 2026-10-22; no application scaffold or dependency manifest exists yet.
- Establish commands from implemented repository tooling, then update this section and `docs/implementation-status.md` with commands that actually ran.
- Begin with the earliest unfinished phase in `docs/implementation-status.md`, and leave external production-admission gates open until their evidence is observed.
