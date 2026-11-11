import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[orderId]/route";
import { POST as submitPayment } from "@/app/api/payments/route";
import { DELAYED_PROCESSOR_MS, reconcilePayment, settleDelayedProcessorEvent } from "@/lib/payment/payment-service";

type OrderResponse = { order: { id: string; status: string; simulatedChargeCount?: number; events?: Array<{ type: string }> } };

async function newOrder() {
  const response = await createOrder();
  expect(response.status).toBe(201);
  return (await response.json() as OrderResponse).order;
}

function paymentRequest(body: Record<string, unknown>) {
  return submitPayment(new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function orderSnapshot(orderId: string) {
  const response = await getOrder(new Request(`http://localhost/api/orders/${orderId}`), { params: Promise.resolve({ orderId }) });
  expect(response.status).toBe(200);
  return (await response.json() as OrderResponse).order;
}

async function dashboardSnapshot(orderId: string) {
  const body = await (await getDashboard()).json();
  return { body, transaction: body.transactions.find((item: { id: string }) => item.id === orderId) };
}

beforeEach(async () => {
  await db.simulatedCharge.deleteMany();
  await db.paymentEvent.deleteMany();
  await db.paymentAttempt.deleteMany();
  await db.order.deleteMany();
});

describe("payment HTTP integration", () => {
  it("returns a confirmed customer state and dashboard record for a normal success", async () => {
    const order = await newOrder();
    const response = await paymentRequest({ orderId: order.id, idempotencyKey: "api-success", scenario: "SUCCESS" });
    expect(response.status).toBe(200);

    const persisted = await orderSnapshot(order.id);
    expect(persisted).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
    expect(persisted.events?.map((event) => event.type)).toEqual(expect.arrayContaining(["ORDER_CREATED", "PAYMENT_STARTED", "SIMULATED_CHARGE_CREATED"]));

    const dashboard = await getDashboard();
    const dashboardBody = await dashboard.json();
    expect(dashboardBody.metrics).toMatchObject({ total: 1, succeeded: 1, successRate: 100 });
    expect(dashboardBody.transactions[0]).toMatchObject({ id: order.id, status: "SUCCEEDED", simulatedChargeCount: 1 });
  });

  it("returns a definitive decline and recovery data without a charge", async () => {
    const order = await newOrder();
    const response = await paymentRequest({ orderId: order.id, idempotencyKey: "api-decline", scenario: "HARD_DECLINE" });
    expect(response.status).toBe(200);

    const persisted = await orderSnapshot(order.id);
    expect(persisted).toMatchObject({ status: "FAILED", simulatedChargeCount: 0 });
    const dashboardBody = await (await getDashboard()).json();
    expect(dashboardBody.metrics).toMatchObject({ failed: 1, unknown: 0 });
    expect(dashboardBody.transactions[0]).toMatchObject({ errorCode: "BANK_HARD_DECLINE", errorCategory: "ISSUER_DECLINE" });
    expect(dashboardBody.transactions[0].recommendedAction).toContain("another payment method");
  });

  it("handles two rapid Pay requests with one key as one charge", async () => {
    const order = await newOrder();
    const body = { orderId: order.id, idempotencyKey: "api-double-click", scenario: "SUCCESS" };
    const [first, second] = await Promise.all([paymentRequest(body), paymentRequest(body)]);
    expect([first.status, second.status]).toEqual([200, 200]);

    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { orderId: order.id, type: "DUPLICATE_REUSED" } })).toBe(1);
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1, duplicateRequestsHandled: 1 });
  });

  it("serializes concurrent different-key requests and creates only one operation", async () => {
    const order = await newOrder();
    const responses = await Promise.all(["a", "b", "c", "d"].map((suffix) => paymentRequest({ orderId: order.id, idempotencyKey: `api-race-${suffix}`, scenario: "SUCCESS" })));
    expect(responses.every((response) => response.status === 200)).toBe(true);

    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { orderId: order.id, type: "DUPLICATE_BLOCKED" } })).toBe(3);
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1, duplicateRequestsHandled: 3 });
  });

  it("blocks retry while UNKNOWN, then reconciles the original attempt", async () => {
    const order = await newOrder();
    await paymentRequest({ orderId: order.id, idempotencyKey: "api-timeout", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" });
    const retry = await paymentRequest({ orderId: order.id, idempotencyKey: "api-timeout-retry", scenario: "SUCCESS" });
    expect(retry.status).toBe(200);

    let persisted = await orderSnapshot(order.id);
    expect(persisted).toMatchObject({ status: "UNKNOWN", simulatedChargeCount: 0 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "UNKNOWN", simulatedChargeCount: 0 });

    const future = new Date(Date.now() + DELAYED_PROCESSOR_MS + 1_000);
    await reconcilePayment(order.id, db, future);
    persisted = await orderSnapshot(order.id);
    expect(persisted).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
  });

  it("returns 409 when one idempotency key is reused with different details", async () => {
    const order = await newOrder();
    await paymentRequest({ orderId: order.id, idempotencyKey: "api-conflict", scenario: "SUCCESS" });
    const conflict = await paymentRequest({ orderId: order.id, idempotencyKey: "api-conflict", scenario: "HARD_DECLINE" });
    const body = await conflict.json();

    expect(conflict.status).toBe(409);
    expect(body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_DETAILS" });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { orderId: order.id, type: "IDEMPOTENCY_CONFLICT" } })).toBe(1);
    expect((await dashboardSnapshot(order.id)).transaction.events.some((event: { type: string }) => event.type === "IDEMPOTENCY_CONFLICT")).toBe(true);
  });

  it("serves PROCESSING during an in-flight request and the final state after refresh", async () => {
    const order = await newOrder();
    const inFlight = paymentRequest({ orderId: order.id, idempotencyKey: "api-refresh", scenario: "SUCCESS" });

    let processing: OrderResponse["order"] | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const snapshot = await orderSnapshot(order.id);
      if (snapshot.status === "PROCESSING") { processing = snapshot; break; }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(processing).toMatchObject({ status: "PROCESSING", simulatedChargeCount: 0 });

    await inFlight;
    expect(await orderSnapshot(order.id)).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
  });

  it("records a late processor event after reconciliation starts and then updates the dashboard", async () => {
    const order = await newOrder();
    const response = await paymentRequest({ orderId: order.id, idempotencyKey: "api-late-event", scenario: "CLIENT_TIMEOUT_BACKEND_SUCCESS" });
    const result = (await response.json()).result;
    const early = await reconcilePayment(order.id, db, new Date());
    expect(early).toMatchObject({ orderStatus: "UNKNOWN", pending: true });

    const future = new Date(Date.now() + DELAYED_PROCESSOR_MS + 1_000);
    await settleDelayedProcessorEvent(result.attemptId, db, future);
    await reconcilePayment(order.id, db, future);

    const transaction = (await dashboardSnapshot(order.id)).transaction;
    expect(transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1 });
    expect(transaction.events.map((event: { type: string }) => event.type)).toEqual([
      "ORDER_CREATED", "PAYMENT_STARTED", "PAYMENT_OUTCOME_UNKNOWN", "RECONCILIATION_PENDING", "PROCESSOR_SUCCEEDED_LATE", "RECONCILIATION_SUCCEEDED",
    ]);
  });

  it("blocks a new payment request after the order is already paid", async () => {
    const order = await newOrder();
    await paymentRequest({ orderId: order.id, idempotencyKey: "api-paid-first", scenario: "SUCCESS" });
    const second = await paymentRequest({ orderId: order.id, idempotencyKey: "api-paid-second", scenario: "SUCCESS" });
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.result).toMatchObject({ orderStatus: "SUCCEEDED", duplicatesPrevented: 1, simulatedChargeCount: 1 });
    expect(await db.paymentAttempt.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.simulatedCharge.count({ where: { orderId: order.id } })).toBe(1);
    expect((await dashboardSnapshot(order.id)).transaction).toMatchObject({ status: "SUCCEEDED", simulatedChargeCount: 1, duplicateRequestsHandled: 1 });
  });
});
