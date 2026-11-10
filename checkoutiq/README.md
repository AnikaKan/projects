# CheckoutIQ

CheckoutIQ is a local, full-stack **payment reliability and recovery simulator**. It demonstrates how a merchant can distinguish a confirmed failure from an uncertain outcome, reconcile a timeout, and prevent duplicate charges.

> CheckoutIQ uses simulated payment processing only. It does not collect card data, create charges, connect to a payment gateway, or claim an Apple Pay integration.

## Current milestone

The initial working application includes:

- A polished customer checkout with a sample cart and integer-cent totals.
- Deterministic success, decline, validation, processor-failure, timeout, and duplicate-request scenarios.
- Persistent `Order`, `PaymentAttempt`, `SimulatedCharge`, and `PaymentEvent` records in SQLite.
- A server-owned state machine: `CREATED → PROCESSING → SUCCEEDED | FAILED | UNKNOWN`.
- Server-side idempotency, unique database constraints, order-level request serialization, and duplicate-charge guards.
- Reconciliation of an `UNKNOWN` timeout before any new attempt is allowed.
- Automated state-transition and duplicate-prevention tests.
- A dedicated interactive failure simulator at `/simulator` with customer, merchant, and backend perspectives.
- Deterministic error classification, recovery guidance, and a persisted event-by-event timeline.
- A visible `UNKNOWN → reconciliation → SUCCEEDED` demonstration for client timeouts followed by backend success.
- A visible per-order simulated charge counter backed by a one-charge-per-order database constraint.
- An explicit controlled-retry contract for confirmed failures (`retryOfAttemptId`).
- A payment reliability dashboard at `/dashboard` with calculated KPIs, interactive Recharts visualizations, state/error filters, transaction drill-down, and persisted event history.
- A deterministic 36-transaction demonstration dataset covering processor latency, issuer declines, integration errors, timeouts, and safely handled duplicates.

The dedicated operations dashboard is planned as the next milestone. The checkout and failure simulator both use the same server-owned state machine and SQLite event history.

## Architecture

The App Router UI calls route handlers under `/api`. Route handlers delegate to a payment domain service, which is the only layer allowed to change payment state. The service creates a durable `PROCESSING` attempt before invoking a deterministic processor. SQLite uniqueness protects both idempotency keys and the one-charge-per-order ledger. An order-scoped server queue plus compare-and-swap database updates serialize local concurrent requests, while immutable event records make every decision inspectable.

## Run locally

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test
npm run typecheck
npm run build
```

Tests use a separate SQLite database at `prisma/test.db`, reset on every run.

`npm run db:seed` replaces only orders prefixed `DEMO-REL-`; simulator-created orders are preserved. The dashboard can also regenerate this dataset from its toolbar.

## Safety model

- A timeout is recorded as `UNKNOWN`; it is not treated as a decline.
- A new idempotency key is rejected while an order is `PROCESSING`, `UNKNOWN`, or `SUCCEEDED`.
- Reusing an idempotency key returns the existing attempt rather than invoking the processor again.
- Reconciliation resolves the processor's stored deterministic outcome and only then finalizes the order.
- A succeeded order is terminal and cannot be charged again.
- A definitive failure accepts a new processor operation only when the request explicitly references the failed attempt.
- Delayed processor completion is applied by attempt ID, and its transaction creates the simulated charge before reconciliation finalizes the order.
