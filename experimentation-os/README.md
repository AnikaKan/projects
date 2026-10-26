# ExperimentOS

ExperimentOS is an early-stage platform for running controlled product experiments with stable assignment, scoped access, durable event processing, reproducible analysis, and auditable human decisions.

> **Status:** The Day 1 technical foundation has been implemented and verified locally. Experiment assignment, event processing, statistical analysis, and the full operator workflow are not implemented yet. This project is not production-ready.

## What works today

- Next.js and TypeScript operator-console foundation
- FastAPI API with independently runnable ingestion and analysis workers
- PostgreSQL schema and Alembic migrations
- Typed OpenAPI boundary between the API and frontend
- Managed-OIDC integration contract with an isolated local test mode
- Server-enforced operator roles and project/environment boundaries
- Scoped service credentials with digest-only storage, rotation, and revocation
- Server-side TypeScript SDK and example host application
- Docker-based local PostgreSQL and queue emulation
- Terraform definitions for isolated staging and production infrastructure
- GitHub Actions checks for Python, TypeScript, Terraform, and container builds

Local verification has covered clean PostgreSQL migration, rollback and reapplication; service startup and health; unauthorized and cross-environment denial; credential scope, hashing, auditing, and revocation; container builds; secret scanning; and Terraform validation without creating cloud resources.

## Architecture

```text
Operators -> Next.js console -> FastAPI API -> PostgreSQL

Product service -> server-side SDK -> assignment API
Product events  -> event collector -> durable queue -> workers
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

## Current boundaries

- Local development authentication is rejected by production configuration.
- Staging and production are designed as separate environments.
- No cloud resources, real traffic, customer data, or production reliability claims are included.
- Human approval remains required for product releases.
- Missing or invalid evidence must block an experimental recommendation.

The next release gate is hosted CI verification, followed by authorized managed-identity testing and an account-specific infrastructure and cost review.
