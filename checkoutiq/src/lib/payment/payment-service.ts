import { Prisma, type PaymentAttempt } from "@prisma/client";
import { createHash } from "node:crypto";
import { db as defaultDb } from "@/lib/db";
import { assertTransition } from "./state-machine";
import { runSimulatedProcessor } from "./simulated-processor";
import { isPaymentStatus, type PaymentScenario, type PaymentServiceResult, type PaymentStatus } from "./types";

type Database = typeof defaultDb;
type ProcessPaymentInput = {
  orderId: string;
  idempotencyKey: string;
  scenario: PaymentScenario;
  retryOfAttemptId?: string;
};

export const DELAYED_PROCESSOR_MS = 2_000;
const orderQueues = new Map<string, Promise<void>>();

class OrderStateChangedError extends Error {}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_DETAILS";
  constructor() {
    super("This idempotency key is already associated with different payment details.");
    this.name = "IdempotencyConflictError";
  }
}

function requestFingerprint(input: ProcessPaymentInput, amountCents: number) {
  return createHash("sha256").update(JSON.stringify({
    orderId: input.orderId,
    amountCents,
    scenario: input.scenario,
    retryOfAttemptId: input.retryOfAttemptId ?? null,
  })).digest("hex");
}

function idempotencyDetailsMatch(attempt: PaymentAttempt, input: ProcessPaymentInput, amountCents: number) {
  if (attempt.requestFingerprint) return attempt.requestFingerprint === requestFingerprint(input, amountCents);
  return attempt.orderId === input.orderId && attempt.amountCents === amountCents && attempt.scenario === input.scenario;
}

async function assertIdempotencyDetailsMatch(
  database: Database,
  attempt: PaymentAttempt,
  input: ProcessPaymentInput,
  amountCents: number,
) {
  if (idempotencyDetailsMatch(attempt, input, amountCents)) return;
  const error = new IdempotencyConflictError();
  await database.paymentEvent.create({
    data: {
      orderId: input.orderId,
      type: "IDEMPOTENCY_CONFLICT",
      message: error.message,
      metadata: JSON.stringify({
        attemptedIdempotencyKey: input.idempotencyKey,
        attemptedScenario: input.scenario,
        existingOrderId: attempt.orderId,
        existingAttemptId: attempt.id,
      }),
    },
  });
  throw error;
}

async function withOrderLock<T>(orderId: string, work: () => Promise<T>) {
  const previous = orderQueues.get(orderId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  orderQueues.set(orderId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (orderQueues.get(orderId) === queued) orderQueues.delete(orderId);
  }
}

async function simulatedChargeCount(database: Database, orderId: string) {
  return database.simulatedCharge.count({ where: { orderId } });
}

async function attemptResult(
  database: Database,
  attempt: PaymentAttempt,
  orderStatus: string,
  options: { reused?: boolean; prevented?: number; blockedReason?: string; message?: string } = {},
): Promise<PaymentServiceResult> {
  if (!isPaymentStatus(orderStatus) || !isPaymentStatus(attempt.status)) throw new Error("Invalid stored payment status.");
  return {
    orderId: attempt.orderId,
    orderStatus,
    attemptId: attempt.id,
    attemptStatus: attempt.status,
    idempotencyKey: attempt.idempotencyKey,
    reused: options.reused ?? false,
    duplicatesPrevented: options.prevented ?? 0,
    simulatedChargeCount: await simulatedChargeCount(database, attempt.orderId),
    blockedReason: options.blockedReason,
    message: options.message,
  };
}

async function blockedResult(
  database: Database,
  input: ProcessPaymentInput,
  orderStatus: PaymentStatus,
  blockedReason: string,
  message?: string,
): Promise<PaymentServiceResult> {
  await database.paymentEvent.create({
    data: {
      orderId: input.orderId,
      type: "DUPLICATE_BLOCKED",
      message: message ?? blockedReason,
      metadata: JSON.stringify({ attemptedIdempotencyKey: input.idempotencyKey }),
    },
  });
  return {
    orderId: input.orderId,
    orderStatus,
    idempotencyKey: input.idempotencyKey,
    reused: false,
    duplicatesPrevented: 1,
    simulatedChargeCount: await simulatedChargeCount(database, input.orderId),
    blockedReason,
    message,
  };
}

function duplicateMessage(status: string) {
  if (status === "SUCCEEDED") return "Duplicate charge prevented — existing payment confirmed.";
  if (status === "UNKNOWN") return "Duplicate request prevented — reconcile the existing payment before retrying.";
  if (status === "PROCESSING") return "Duplicate request prevented — the existing payment is still processing.";
  return "Duplicate request reused the existing payment operation.";
}

async function currentStateResult(database: Database, input: ProcessPaymentInput): Promise<PaymentServiceResult> {
  const currentOrder = await database.order.findUnique({ where: { id: input.orderId } });
  if (!currentOrder || !isPaymentStatus(currentOrder.status)) throw new Error("Order not found.");
  const racedAttempt = await database.paymentAttempt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { order: true },
  });
  if (racedAttempt) {
    await assertIdempotencyDetailsMatch(database, racedAttempt, input, currentOrder.totalCents);
    const message = duplicateMessage(racedAttempt.order.status);
    await database.paymentEvent.create({
      data: { orderId: racedAttempt.orderId, attemptId: racedAttempt.id, type: "DUPLICATE_REUSED", message },
    });
    return attemptResult(database, racedAttempt, racedAttempt.order.status, { reused: true, prevented: 1, message });
  }
  const message = duplicateMessage(currentOrder.status);
  return blockedResult(database, input, currentOrder.status, message, message);
}

async function validateRetry(database: Database, input: ProcessPaymentInput, orderStatus: PaymentStatus) {
  if (orderStatus !== "FAILED") return null;
  const latestFailed = await database.paymentAttempt.findFirst({
    where: { orderId: input.orderId, status: "FAILED" },
    orderBy: { createdAt: "desc" },
  });
  if (!latestFailed || input.retryOfAttemptId !== latestFailed.id) {
    return "A definitive failure requires an explicit retry referencing the failed attempt.";
  }
  return null;
}

async function processOnce(database: Database, input: ProcessPaymentInput): Promise<PaymentServiceResult> {
  return withOrderLock(input.orderId, async () => {
    const order = await database.order.findUnique({ where: { id: input.orderId } });
    if (!order || !isPaymentStatus(order.status)) throw new Error("Order not found.");
    const existing = await database.paymentAttempt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { order: true },
    });
    if (existing) {
      await assertIdempotencyDetailsMatch(database, existing, input, order.totalCents);
      const message = duplicateMessage(existing.order.status);
      await database.paymentEvent.create({
        data: { orderId: existing.orderId, attemptId: existing.id, type: "DUPLICATE_REUSED", message },
      });
      return attemptResult(database, existing, existing.order.status, { reused: true, prevented: 1, message });
    }
    if (["SUCCEEDED", "UNKNOWN", "PROCESSING"].includes(order.status)) {
      const message = duplicateMessage(order.status);
      return blockedResult(database, input, order.status, message, message);
    }
    const retryError = await validateRetry(database, input, order.status);
    if (retryError) return blockedResult(database, input, order.status, retryError, "Controlled retry required — no new processor request was created.");
    assertTransition(order.status, "PROCESSING");

    let attempt: PaymentAttempt;
    try {
      attempt = await database.$transaction(async (tx) => {
        const claim = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: "PROCESSING" },
        });
        if (claim.count !== 1) throw new OrderStateChangedError();
        const created = await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: requestFingerprint(input, order.totalCents),
            scenario: input.scenario,
            status: "PROCESSING",
            amountCents: order.totalCents,
          },
        });
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            attemptId: created.id,
            type: order.status === "FAILED" ? "CONTROLLED_RETRY_STARTED" : "PAYMENT_STARTED",
            message: order.status === "FAILED"
              ? `Controlled retry started for failed attempt ${input.retryOfAttemptId}.`
              : `Simulated payment started for ${order.totalCents} cents.`,
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof OrderStateChangedError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        return currentStateResult(database, input);
      }
      throw error;
    }

    const processor = await runSimulatedProcessor(input.scenario, input.idempotencyKey);
    assertTransition("PROCESSING", processor.visibleStatus);
    const processorAvailableAt = processor.visibleStatus === "UNKNOWN"
      ? new Date(Date.now() + DELAYED_PROCESSOR_MS)
      : null;

    try {
      const finalized = await database.$transaction(async (tx) => {
        if (processor.visibleStatus === "SUCCEEDED") {
          await tx.simulatedCharge.create({
            data: {
              orderId: order.id,
              attemptId: attempt.id,
              processorReference: processor.processorReference!,
              amountCents: order.totalCents,
            },
          });
        }
        const updated = await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: processor.visibleStatus,
            processorOutcome: processor.processorOutcome,
            processorReference: processor.processorReference,
            processorAvailableAt,
            processorCompletedAt: processor.processorOutcome ? new Date() : null,
            errorCode: processor.errorCode,
            errorCategory: processor.errorCategory,
            errorMessage: processor.errorMessage,
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { status: processor.visibleStatus } });
        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            attemptId: attempt.id,
            type: processor.visibleStatus === "SUCCEEDED" ? "SIMULATED_CHARGE_CREATED" : processor.visibleStatus === "UNKNOWN" ? "PAYMENT_OUTCOME_UNKNOWN" : "PAYMENT_FAILED",
            message: processor.visibleStatus === "SUCCEEDED"
              ? "The simulated processor confirmed one charge. The database charge guard is now locked for this order."
              : processor.errorMessage ?? "The simulated payment failed.",
          },
        });
        return updated;
      });
      return attemptResult(database, finalized, processor.visibleStatus);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const message = "Duplicate charge prevented — existing payment confirmed.";
        await database.$transaction(async (tx) => {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: "FAILED", errorCode: "DUPLICATE_CHARGE_BLOCKED", errorCategory: "IDEMPOTENCY", errorMessage: message },
          });
          await tx.order.update({ where: { id: order.id }, data: { status: "SUCCEEDED" } });
          await tx.paymentEvent.create({ data: { orderId: order.id, attemptId: attempt.id, type: "DUPLICATE_CHARGE_PREVENTED", message } });
        });
        return currentStateResult(database, input);
      }
      throw error;
    }
  });
}

export async function processPayment(input: ProcessPaymentInput, database: Database = defaultDb) {
  if (input.scenario === "DUPLICATE_REQUEST") {
    await processOnce(database, input);
    return processOnce(database, input);
  }
  if (input.scenario === "CONCURRENT_DUPLICATE_REQUESTS") {
    const results = await Promise.all([
      processOnce(database, input),
      processOnce(database, input),
      processOnce(database, input),
    ]);
    const final = results.at(-1)!;
    return {
      ...final,
      duplicatesPrevented: results.filter((item) => item.reused || item.blockedReason).length,
      simulatedChargeCount: await simulatedChargeCount(database, input.orderId),
      message: "Duplicate charge prevented — existing payment confirmed.",
    };
  }
  return processOnce(database, input);
}

async function settleDelayedProcessorEventUnlocked(
  attemptId: string,
  database: Database,
  now: Date,
) {
  const attempt = await database.paymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error("Payment attempt not found.");
  if (attempt.scenario !== "CLIENT_TIMEOUT_BACKEND_SUCCESS") return { settled: false, reason: "NOT_DELAYED_SCENARIO", orderId: attempt.orderId };
  if (attempt.processorOutcome === "SUCCEEDED") return { settled: false, reason: "ALREADY_SETTLED", orderId: attempt.orderId };
  if (!attempt.processorAvailableAt || attempt.processorAvailableAt > now) return { settled: false, reason: "PROCESSOR_STILL_PENDING", orderId: attempt.orderId };

  try {
    const settled = await database.$transaction(async (tx) => {
      const claim = await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          orderId: attempt.orderId,
          status: "UNKNOWN",
          processorOutcome: null,
          processorAvailableAt: { lte: now },
        },
        data: { processorOutcome: "SUCCEEDED", processorCompletedAt: now },
      });
      if (claim.count !== 1) return false;
      await tx.simulatedCharge.create({
        data: {
          orderId: attempt.orderId,
          attemptId: attempt.id,
          processorReference: attempt.processorReference!,
          amountCents: attempt.amountCents,
          createdAt: now,
        },
      });
      await tx.paymentEvent.create({
        data: {
          orderId: attempt.orderId,
          attemptId: attempt.id,
          type: "PROCESSOR_SUCCEEDED_LATE",
          message: "The delayed processor event confirmed one simulated charge for the original attempt.",
          createdAt: now,
        },
      });
      return true;
    });
    return { settled, reason: settled ? "SETTLED" : "ALREADY_CLAIMED", orderId: attempt.orderId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { settled: false, reason: "CHARGE_ALREADY_EXISTS", orderId: attempt.orderId };
    }
    throw error;
  }
}

export async function settleDelayedProcessorEvent(
  attemptId: string,
  database: Database = defaultDb,
  now = new Date(),
) {
  const attempt = await database.paymentAttempt.findUnique({ where: { id: attemptId }, select: { orderId: true } });
  if (!attempt) throw new Error("Payment attempt not found.");
  return withOrderLock(attempt.orderId, () => settleDelayedProcessorEventUnlocked(attemptId, database, now));
}

export async function reconcilePayment(orderId: string, database: Database = defaultDb, now = new Date()) {
  return withOrderLock(orderId, async () => {
    const order = await database.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempts: { orderBy: { createdAt: "desc" } } },
    });
    if (!order || !isPaymentStatus(order.status)) throw new Error("Order not found.");
    if (order.status !== "UNKNOWN") {
      return { orderId, orderStatus: order.status, reconciled: false, simulatedChargeCount: await simulatedChargeCount(database, orderId) };
    }
    const unknownAttempt = order.paymentAttempts.find((item) => item.status === "UNKNOWN");
    if (!unknownAttempt) throw new Error("No unknown attempt to reconcile.");

    if (!unknownAttempt.processorOutcome) {
      await settleDelayedProcessorEventUnlocked(unknownAttempt.id, database, now);
    }
    const attempt = await database.paymentAttempt.findUnique({ where: { id: unknownAttempt.id } });
    if (!attempt?.processorOutcome) {
      await database.paymentEvent.create({
        data: {
          orderId,
          attemptId: unknownAttempt.id,
          type: "RECONCILIATION_PENDING",
          message: "The original processor operation is still pending. No retry or new charge was created.",
          createdAt: now,
        },
      });
      return { orderId, orderStatus: "UNKNOWN" as const, reconciled: false, pending: true, simulatedChargeCount: 0 };
    }

    const resolvedStatus: PaymentStatus = attempt.processorOutcome === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
    assertTransition("UNKNOWN", resolvedStatus);
    await database.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: resolvedStatus,
          errorCode: resolvedStatus === "SUCCEEDED" ? null : attempt.errorCode,
          errorCategory: resolvedStatus === "SUCCEEDED" ? null : attempt.errorCategory,
          errorMessage: resolvedStatus === "SUCCEEDED" ? null : attempt.errorMessage,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: resolvedStatus } });
      await tx.paymentEvent.create({
        data: {
          orderId,
          attemptId: attempt.id,
          type: `RECONCILIATION_${resolvedStatus}`,
          message: resolvedStatus === "SUCCEEDED"
            ? "Reconciliation confirmed the original simulated charge. No replacement attempt was created."
            : "Reconciliation confirmed failure; an explicitly authorized retry is now safe.",
          createdAt: new Date(now.getTime() + 1),
        },
      });
    });
    return {
      orderId,
      orderStatus: resolvedStatus,
      attemptId: attempt.id,
      reconciled: true,
      simulatedChargeCount: await simulatedChargeCount(database, orderId),
    };
  });
}
