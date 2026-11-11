import { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  DELAYED_PROCESSOR_MS,
  IdempotencyConflictError,
  processPayment,
  reconcilePayment,
  settleDelayedProcessorEvent,
} from "@/lib/payment/payment-service";
import { PROCESSOR_SIMULATION_DELAY_MS } from "@/lib/payment/simulated-processor";

let orderSequence = 0;

async function createOrder() {
  orderSequence += 1;
  return db.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}-${orderSequence}`,
      subtotalCents: 12_900,
      taxCents: 1_103,
      totalCents: 14_003,
    },
  });
}

async function waitForOrderStatus(orderId: string, status: string) {
  const deadline = Date.now() + PROCESSOR_SIMULATION_DELAY_MS * 4;
  while (Date.now() < deadline) {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === status) return order;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Order ${orderId} did not reach ${status}.`);
}

beforeEach(async () => {
  await db.simulatedCharge.deleteMany();
  await db.paymentEvent.deleteMany();
  await db.paymentAttempt.deleteMany();
  await db.order.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("duplicate-charge prevention", () => {
  it("persists a normal success, one charge, and its complete event trail", async () => {
    const order = await createOrder();
    const result = await processPayment({ orderId: order.id, idempotencyKey: "normal-success", scenario: "SUCCESS" }, db);
    const persisted = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true, events: { orderBy: { createdAt: "asc" } }, simulatedCharge: true } });

    expect(result).toMatchObject({ orderStatus: "SUCCEEDED", attemptStatus: "SUCCEEDED", simulatedChargeCount: 1 });
    expect(persisted.status).toBe("SUCCEEDED");
    expect(persisted.paymentAttempts).toHaveLength(1);
    expect(persisted.simulatedCharge?.amountCents).toBe(order.totalCents);
    expect(persisted.events.map((event) => event.type)).toEqual(["PAYMENT_STARTED", "SIMULATED_CHARGE_CREATED"]);
  });

  it("persists a bank hard decline without creating a charge", async () => {
    const order = await createOrder();
    const result = await processPayment({ orderId: order.id, idempotencyKey: "issuer-decline", scenario: "HARD_DECLINE" }, db);
    const persisted = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true, events: true, simulatedCharge: true } });

    expect(result).toMatchObject({ orderStatus: "FAILED", attemptStatus: "FAILED", simulatedChargeCount: 0 });
    expect(persisted.paymentAttempts[0]).toMatchObject({ errorCode: "BANK_HARD_DECLINE", errorCategory: "ISSUER_DECLINE" });
    expect(persisted.simulatedCharge).toBeNull();
    expect(persisted.events.some((event) => event.type === "PAYMENT_FAILED")).toBe(true);
  });

  it("reuses one persistent operation when a customer clicks Pay twice", async () => {
    const order = await createOrder();
    const input = { orderId: order.id, idempotencyKey: "double-click-key", scenario: "SUCCESS" as const };

    const first = await processPayment(input, db);
    const second = await processPayment(input, db);

    expect(first).toMatchObject({ orderStatus: "SUCCEEDED", simulatedChargeCount: 1, reused: false });
    expect(second).toMatchObject({
      attemptId: first.attemptId,
      reused: true,
      duplicatesPrevented: 1,
      simulatedChargeCount: 1,
      message: "Duplicate charge prevented — existing payment confirmed.",
    });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("never charges a successful order again, even with a new idempotency key", async () => {
    const order = await createOrder();
    await processPayment({ orderId: order.id, idempotencyKey: "first-key", scenario: "SUCCESS" }, db);

    const blocked = await processPayment(
      { orderId: order.id, idempotencyKey: "new-key-after-success", scenario: "SUCCESS" },
      db,
    );

    expect(blocked).toMatchObject({
      orderStatus: "SUCCEEDED",
      duplicatesPrevented: 1,
      simulatedChargeCount: 1,
      message: "Duplicate charge prevented — existing payment confirmed.",
    });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("rejects an idempotency key reused with different payment details", async () => {
    const firstOrder = await createOrder();
    const secondOrder = await createOrder();
    await processPayment({ orderId: firstOrder.id, idempotencyKey: "conflicting-key", scenario: "SUCCESS" }, db);

    await expect(processPayment({ orderId: firstOrder.id, idempotencyKey: "conflicting-key", scenario: "HARD_DECLINE" }, db)).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(processPayment({ orderId: secondOrder.id, idempotencyKey: "conflicting-key", scenario: "SUCCESS" }, db)).rejects.toBeInstanceOf(IdempotencyConflictError);

    expect(await db.paymentAttempt.count({ where: { idempotencyKey: "conflicting-key" } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: firstOrder.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: secondOrder.id } })).toBe(0);
    expect(await db.paymentEvent.count({ where: { type: "IDEMPOTENCY_CONFLICT" } })).toBe(2);
  });

  it("exposes persisted PROCESSING state so a refreshed client can recover", async () => {
    const order = await createOrder();
    const pending = processPayment({ orderId: order.id, idempotencyKey: "refresh-in-flight", scenario: "SUCCESS" }, db);

    const processing = await waitForOrderStatus(order.id, "PROCESSING");
    expect(processing.status).toBe("PROCESSING");
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(0);

    await pending;
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SUCCEEDED");
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("reconciles an UNKNOWN payment instead of creating a timeout retry", async () => {
    const order = await createOrder();
    const unknown = await processPayment(
      { orderId: order.id, idempotencyKey: "timeout-key", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" },
      db,
    );

    const blockedRetry = await processPayment(
      { orderId: order.id, idempotencyKey: "unsafe-new-key", scenario: "SUCCESS" },
      db,
    );
    const earlyReconciliation = await reconcilePayment(order.id, db, new Date());

    expect(unknown).toMatchObject({ orderStatus: "UNKNOWN", simulatedChargeCount: 0 });
    expect(blockedRetry).toMatchObject({
      orderStatus: "UNKNOWN",
      duplicatesPrevented: 1,
      simulatedChargeCount: 0,
      message: "Duplicate request prevented — reconcile the existing payment before retrying.",
    });
    expect(earlyReconciliation).toMatchObject({ orderStatus: "UNKNOWN", pending: true, simulatedChargeCount: 0 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);

    const afterProcessorDelay = new Date(Date.now() + DELAYED_PROCESSOR_MS + 1_000);
    const reconciled = await reconcilePayment(order.id, db, afterProcessorDelay);

    expect(reconciled).toMatchObject({ orderStatus: "SUCCEEDED", reconciled: true, simulatedChargeCount: 1 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("requires an explicit controlled retry after a definitive failure", async () => {
    const order = await createOrder();
    const failed = await processPayment(
      { orderId: order.id, idempotencyKey: "decline-key", scenario: "HARD_DECLINE" },
      db,
    );
    const uncontrolled = await processPayment(
      { orderId: order.id, idempotencyKey: "uncontrolled-retry", scenario: "SUCCESS" },
      db,
    );

    expect(failed).toMatchObject({ orderStatus: "FAILED", simulatedChargeCount: 0 });
    expect(uncontrolled).toMatchObject({
      orderStatus: "FAILED",
      simulatedChargeCount: 0,
      message: "Controlled retry required — no new processor request was created.",
    });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);

    const retried = await processPayment(
      {
        orderId: order.id,
        idempotencyKey: "authorized-retry",
        scenario: "SUCCESS",
        retryOfAttemptId: failed.attemptId,
      },
      db,
    );

    expect(retried).toMatchObject({ orderStatus: "SUCCEEDED", simulatedChargeCount: 1 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(2);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("collapses many concurrent same-key requests into one attempt and one charge", async () => {
    const order = await createOrder();
    const input = { orderId: order.id, idempotencyKey: "concurrent-same-key", scenario: "SUCCESS" as const };

    const results = await Promise.all(Array.from({ length: 12 }, () => processPayment(input, db)));

    expect(results.filter((result) => result.reused)).toHaveLength(11);
    expect(new Set(results.map((result) => result.attemptId))).toHaveLength(1);
    expect(results.every((result) => result.simulatedChargeCount === 1)).toBe(true);
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("blocks concurrent different-key requests after the winning operation", async () => {
    const order = await createOrder();

    const results = await Promise.all([
      processPayment({ orderId: order.id, idempotencyKey: "racing-key-a", scenario: "SUCCESS" }, db),
      processPayment({ orderId: order.id, idempotencyKey: "racing-key-b", scenario: "SUCCESS" }, db),
      processPayment({ orderId: order.id, idempotencyKey: "racing-key-c", scenario: "SUCCESS" }, db),
    ]);

    expect(results.filter((result) => result.orderStatus === "SUCCEEDED")).toHaveLength(3);
    expect(results.filter((result) => result.blockedReason)).toHaveLength(2);
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("enforces one charge per order in SQLite even if two writers bypass the service", async () => {
    const order = await createOrder();
    const [attemptA, attemptB] = await Promise.all([
      db.paymentAttempt.create({ data: { orderId: order.id, idempotencyKey: "db-writer-a", scenario: "SUCCESS", status: "PROCESSING", amountCents: order.totalCents } }),
      db.paymentAttempt.create({ data: { orderId: order.id, idempotencyKey: "db-writer-b", scenario: "SUCCESS", status: "PROCESSING", amountCents: order.totalCents } }),
    ]);

    const writes = await Promise.allSettled([
      db.simulatedCharge.create({ data: { orderId: order.id, attemptId: attemptA.id, processorReference: "db-ref-a", amountCents: order.totalCents } }),
      db.simulatedCharge.create({ data: { orderId: order.id, attemptId: attemptB.id, processorReference: "db-ref-b", amountCents: order.totalCents } }),
    ]);

    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = writes.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(rejected?.reason.code).toBe("P2002");
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("applies delayed processor events only to their original transaction", async () => {
    const firstOrder = await createOrder();
    const secondOrder = await createOrder();
    const first = await processPayment(
      { orderId: firstOrder.id, idempotencyKey: "delayed-first", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" },
      db,
    );
    const second = await processPayment(
      { orderId: secondOrder.id, idempotencyKey: "delayed-second", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" },
      db,
    );
    const future = new Date(Date.now() + DELAYED_PROCESSOR_MS + 1_000);

    await settleDelayedProcessorEvent(first.attemptId!, db, future);
    await settleDelayedProcessorEvent(first.attemptId!, db, future);

    const [firstAttempt, secondAttempt] = await Promise.all([
      db.paymentAttempt.findUniqueOrThrow({ where: { id: first.attemptId } }),
      db.paymentAttempt.findUniqueOrThrow({ where: { id: second.attemptId } }),
    ]);
    expect(firstAttempt.processorOutcome).toBe("SUCCEEDED");
    expect(secondAttempt.processorOutcome).toBeNull();
    expect(await db.simulatedCharge.count({ where: { orderId: firstOrder.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: secondOrder.id } })).toBe(0);

    await reconcilePayment(firstOrder.id, db, future);
    expect((await db.order.findUniqueOrThrow({ where: { id: firstOrder.id } })).status).toBe("SUCCEEDED");
    expect((await db.order.findUniqueOrThrow({ where: { id: secondOrder.id } })).status).toBe("UNKNOWN");
  });

  it("accepts a delayed processor event after reconciliation has already reported pending", async () => {
    const order = await createOrder();
    const unknown = await processPayment({ orderId: order.id, idempotencyKey: "late-after-reconcile", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" }, db);

    const firstReconciliation = await reconcilePayment(order.id, db, new Date());
    expect(firstReconciliation).toMatchObject({ orderStatus: "UNKNOWN", pending: true, simulatedChargeCount: 0 });

    const future = new Date(Date.now() + DELAYED_PROCESSOR_MS + 1_000);
    await settleDelayedProcessorEvent(unknown.attemptId!, db, future);
    const finalReconciliation = await reconcilePayment(order.id, db, future);

    expect(finalReconciliation).toMatchObject({ orderStatus: "SUCCEEDED", reconciled: true, simulatedChargeCount: 1 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
    const eventTypes = (await db.paymentEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } })).map((event) => event.type);
    expect(eventTypes).toEqual(["PAYMENT_STARTED", "PAYMENT_OUTCOME_UNKNOWN", "RECONCILIATION_PENDING", "PROCESSOR_SUCCEEDED_LATE", "RECONCILIATION_SUCCEEDED"]);
  });
});
