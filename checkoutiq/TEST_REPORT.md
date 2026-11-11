# CheckoutIQ correctness audit

Audit date: November 10, 2026

## Outcome

- Automated tests: **28 passed, 0 failed** across 5 files.
- TypeScript: passed (`tsc --noEmit`).
- ESLint: passed (`eslint .`).
- Production build: passed (`next build --webpack`).
- One newly added test initially failed because reconciliation events could sort before a delayed processor event. The timestamp source was corrected and the regression test now passes.

## Scenario results

| Scenario | Result | Persisted invariants verified |
| --- | --- | --- |
| Normal payment succeeds | Pass | `SUCCEEDED`, one attempt, one charge, success event, dashboard success record |
| Bank decline | Pass | `FAILED`, zero charges, issuer error classification, recovery guidance |
| Rapid double Pay | Pass | One attempt, one charge, reused idempotent operation, duplicate event |
| Concurrent requests with different keys | Pass | One winning attempt, one charge, losing requests blocked and logged |
| Backend success after client timeout | Pass | Initial `UNKNOWN`, zero charges until delayed outcome, then one charge |
| Retry while `UNKNOWN` | Pass | Retry blocked, no replacement attempt, no replacement charge |
| Delayed response after reconciliation starts | Pass | Pending reconciliation logged, late event targets original attempt, final reconciliation succeeds |
| Refresh during processing | Pass | `PROCESSING` is persisted and readable; checkout restores the active order and polls to terminal state |
| Same idempotency key with different details | Pass | HTTP 409, `IDEMPOTENCY_CONFLICT` event, original attempt and charge unchanged |
| Additional request after payment | Pass | Order remains `SUCCEEDED`, one charge, additional request blocked and logged |

## Functional versus simulated

### Genuinely functional

- SQLite persistence through Prisma for orders, attempts, charges, and event logs.
- Server-side state transitions and controlled retry rules.
- Persistent idempotency keys with a request fingerprint that includes order, amount, scenario, and retry origin.
- Unique database constraints for one charge per order, attempt, and processor reference.
- Database compare-and-swap order claims plus local request serialization.
- `UNKNOWN` retry blocking, delayed-outcome settlement, and reconciliation.
- Checkout recovery through session-scoped active-order restoration and polling of persisted `PROCESSING` state.
- Dashboard metrics, filters, recovery guidance, and transaction timelines calculated from persisted records.

### Simulation-only

- Processor authorization, decline, timeout, and late-success outcomes are deterministic local simulations.
- The late processor event is advanced by the simulator/reconciliation path; there is no independent background worker or webhook consumer.
- The simulator's named concurrent scenario fans out requests inside the server process. Separate HTTP concurrency is covered by integration tests but is not visually initiated by multiple browser clients.
- Dashboard demo history is synthetic and can be regenerated.
- No real wallet, card data, gateway, capture, refund, authentication, or settlement system is connected.

## Remaining limitations and architecture risks

1. The order queue is in memory and coordinates only one Node.js process. Database state claims and unique constraints remain the correctness backstop, but a production multi-instance system should use a durable operation coordinator or processor-native idempotency.
2. SQLite permits limited concurrent writes. The constraints are useful for this local prototype, but production payment traffic should use a transactional server database with explicit isolation and retry handling.
3. `UNKNOWN` payments do not reconcile without an application request. A production system needs a durable scheduled worker and/or signed processor webhooks.
4. Checkout recovery uses `sessionStorage`, so it is tab/browser scoped rather than account scoped.
5. Dashboard queries are capped at the newest 100 orders and do not paginate.
6. The demo seed endpoint is intentionally unauthenticated for local use and should not be exposed as an operations endpoint in production.
7. Browser behavior was manually verified, while automated coverage is at the domain, database, and route-handler layers; a future milestone should add Playwright browser tests.
8. `npm audit` reports four high-severity advisories in the Prisma 6 development CLI dependency chain. They are not used by the running application; the available automatic fix requires a Prisma 7 major-version migration.
