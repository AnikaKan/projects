# ExperimentOS

ExperimentOS is an early-stage platform for running controlled product experiments with stable assignment, scoped access, durable event processing, reproducible analysis, and auditable human decisions.

> **Status:** Days 1–6 are implemented and verified with synthetic data on a local Docker stack. Managed services, external alert delivery, independent statistical review, real traffic, and every production-admission gate remain open. This project is not production-ready.

## What works today

- Next.js and TypeScript operator console for setup, lifecycle, quality, results, decisions, monitoring, and audit history
- FastAPI API with independently runnable ingestion and analysis workers
- Stable, concurrency-safe assignment with separate traffic and arm hashes
- Durable event collection with an outbox, local queue emulation, deduplication, quarantine, replay, and dead-letter behavior
- Assigned-subject cohorts, fixed follow-up windows, retained exclusions, completeness checks, and immutable quality snapshots
- Prespecified primary and guardrail analysis with immutable provenance and human-gated recommendations
- Human decisions linked to finalized snapshots; no automatic product rollout
- Local operational metrics, a local-only test-alert sink, and bounded overload behavior
- PostgreSQL schema and reversible Alembic migrations
- Typed OpenAPI boundary between the API and frontend
- Managed-OIDC integration contract with an isolated local test mode
- Server-enforced operator roles and project/environment boundaries
- Scoped service credentials with digest-only storage, rotation, and revocation
- Server-side TypeScript SDK and example host application
- Docker-based local PostgreSQL and queue emulation
- Terraform definitions for isolated staging and production infrastructure
- GitHub Actions checks for Python, TypeScript, Terraform, and container builds

Local verification has covered clean PostgreSQL migration, rollback and reapplication; service startup and health; unauthorized, role, and cross-environment denial; credential scope, hashing, rotation, and revocation; stable concurrent assignment; queue failure and replay; cohort and analysis edge cases; snapshot-linked decisions and invalidation; accessibility structure; bounded overload and database-failure recovery; container builds; secret scanning; and Terraform validation without creating cloud resources.

## Architecture

```text
Operators -> Next.js console -> FastAPI API -> PostgreSQL

Product service -> server-side SDK -> assignment API
Product events  -> event collector -> durable queue -> workers

Workers -> quality snapshot -> analysis snapshot -> human decision + audit
```

Synchronous assignment is intentionally separated from asynchronous ingestion and analysis so a background backlog cannot silently change assignment behavior.

## Local startup

Prerequisites: Docker Desktop with Docker Compose.

```bash
docker compose up --build -d
```

After startup:

- API health: `http://localhost:8000/health/ready`
- Operator console: `http://localhost:3000`
- Example host: `http://localhost:3100`

Stop the local stack without deleting its database volume:

```bash
docker compose down
```

## Verification

Locked dependencies and established checks are defined by `pnpm-lock.yaml`, `backend/uv.lock`, and the GitHub Actions workflow.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd backend
uv sync --frozen
uv run ruff check app tests ../scripts migrations
uv run mypy app
uv run pytest
```

Terraform validation uses remote state disabled and does not provision resources. A real plan requires reviewed account-specific values and authorized cloud credentials. Applying infrastructure is never the default.

Reproducible Day 6 local load commands and the observed single-machine results are in [`docs/day6-load-testing.md`](docs/day6-load-testing.md) and [`docs/day6-load-results.json`](docs/day6-load-results.json). These results are not a production capacity claim.

## Current boundaries

- Local development authentication is rejected by production configuration.
- Staging and production are designed as separate environments.
- No cloud resources, real traffic, customer data, or production reliability claims are included.
- Human approval remains required for product releases.
- Missing or invalid evidence blocks a recommendation, and a recommendation cannot deploy product code.
- LocalStack and local identity are development substitutes, not evidence about managed services.
- Statistical methods still require independent review before consequential use.

The next local phase is Day 7 release-candidate and recovery drills. Production admission still requires named owners, independent statistical review, managed identity/data/queue verification, external alert receipt, restore and rollback evidence, authorized infrastructure review, and staged real-world observation.
