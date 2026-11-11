# CheckoutIQ contributor guide

## Product boundary

CheckoutIQ is a payment reliability simulator. It must never collect card data, contact a real payment gateway, or imply an Apple Pay integration. Every customer-facing payment affordance and every metric must be labeled as simulated.

## Architecture

- `src/app`: Next.js App Router pages and HTTP route handlers.
- `src/components`: interactive client UI.
- `src/lib/dashboard`: derived reliability metrics and deterministic demo data.
- `src/lib/payment`: payment domain types, state transitions, deterministic processor, and orchestration service.
- `src/lib/db.ts`: the shared Prisma client.
- `prisma/schema.prisma`: SQLite persistence for orders, attempts, the simulated charge ledger, and immutable events.
- `tests`: state-machine and payment-correctness tests.

The HTTP layer validates transport input and calls the domain service. Payment correctness belongs in the server-side domain service, never only in the UI.

## Payment invariants

1. Money is represented as integer cents.
2. A client timeout produces `UNKNOWN`, not `FAILED`.
3. `UNKNOWN` must reconcile before another payment attempt is allowed.
4. The same idempotency key reuses the same logical attempt.
5. A `SUCCEEDED` order can never transition back to a chargeable state.
6. Server-side checks and database uniqueness enforce duplicate protection.
7. `SimulatedCharge.orderId`, `attemptId`, and `processorReference` remain unique.
8. A retry after definitive failure must reference the latest failed attempt explicitly.
9. Delayed processor events must target their original attempt ID and must be safe to replay.
10. Reusing an idempotency key with a different request fingerprint must return a conflict and never reuse the original operation silently.
11. A refreshed checkout must restore its active order and render persisted `PROCESSING` or `UNKNOWN` state accurately.

## Commands

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
npm test
npm run lint
```

## Implementation plan

- Milestone 1: customer checkout, persistent state machine, deterministic outcomes, reconciliation, and correctness tests.
- Milestone 2: dedicated failure simulator with scripted duplicate/concurrency runs, a visible charge ledger count, controlled retries, and delayed-event reconciliation. Completed.
- Milestone 3: engineering dashboard, transaction drill-down, Recharts analytics, filtering, deterministic demo history, and recovery recommendations. Completed.
- Milestone 4: accessibility, end-to-end coverage, seed/demo flows, and portfolio polish.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
