# ExperimentOS

ExperimentOS is a production-minded experimentation platform for controlled configuration, deterministic assignment, durable event collection, reproducible analysis, and auditable launch decisions.

> **Status:** Early design and implementation planning. ExperimentOS is not production-ready, and no reliability or performance claims have been established.

## Goals

ExperimentOS is intended to help a product team run experiments without treating statistical analysis as an isolated dashboard feature. The planned system connects the full lifecycle:

- define and approve an immutable experiment configuration;
- assign subjects consistently at the point of treatment;
- record assignment, exposure, and outcomes as distinct facts;
- ingest events durably while tolerating retries and out-of-order delivery;
- verify cohort integrity, delivery completeness, and sample balance;
- produce reproducible analysis snapshots; and
- retain a human decision with its rationale and rollout reference.

## Planned architecture

```text
Operator console -> Management API -> PostgreSQL
Product service  -> Assignment API -> PostgreSQL
Product events   -> Event collector -> Durable queue -> Workers
                                                    -> Analysis snapshots
```

The initial design uses a Next.js and TypeScript operator console, a FastAPI backend, PostgreSQL, asynchronous ingestion and analysis workers, and a server-side TypeScript SDK.

Synchronous assignment is kept separate from asynchronous event processing so an ingestion backlog cannot silently redefine assignment behavior.

## Initial scope

The first supported boundary is intentionally narrow:

- one organization integrating one real product;
- explicit project and environment isolation;
- one active experiment per project and environment;
- two arms with fixed allocation inside a fixed traffic percentage;
- stable product-generated opaque subject identifiers;
- one binary primary metric and one binary guardrail;
- fixed enrollment, follow-up, and analysis plans; and
- human-approved rollout decisions rather than automated product deployment.

Broader multi-tenant operation, identity merging, regional failover, sequential testing, and multiple interacting experiments are outside the initial scope.

## Design principles

- Unavailable assignment is never fabricated as a control assignment.
- Approved configurations and analysis plans are immutable and audited.
- Queue delivery may duplicate or reorder events; analytical contribution must remain idempotent.
- Assignment, exposure, and outcome populations are not interchangeable.
- Missing delivery or validity evidence blocks confirmatory recommendations.
- Non-significant harm is not evidence that a guardrail is safe.
- Analysis results remain traceable to their configuration, data cutoff, method, and code version.

## Development

Application code and executable setup instructions will be added as implementation begins. Until then, this repository should be treated as a project description rather than a runnable release.
