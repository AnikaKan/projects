import type { PrismaClient } from "@prisma/client";

const DEMO_PREFIX = "DEMO-REL-";

const scenarios = [
  "SUCCESS", "SUCCESS", "SUCCESS", "HARD_DECLINE", "SUCCESS", "CLIENT_TIMEOUT_BACKEND_SUCCESS",
  "SUCCESS", "MERCHANT_VALIDATION_FAILURE", "SUCCESS", "SUCCESS", "PROCESSOR_FAILURE", "SUCCESS",
] as const;

const failureDetails = {
  HARD_DECLINE: { code: "BANK_HARD_DECLINE", category: "ISSUER_DECLINE", message: "The simulated issuing bank declined this payment." },
  MERCHANT_VALIDATION_FAILURE: { code: "MERCHANT_VALIDATION_FAILED", category: "INTEGRATION", message: "The simulated merchant session could not be validated." },
  PROCESSOR_FAILURE: { code: "PROCESSOR_UNAVAILABLE", category: "PROCESSOR", message: "The simulated processor was unavailable before accepting the payment." },
  CLIENT_TIMEOUT_BACKEND_SUCCESS: { code: "CLIENT_TIMEOUT", category: "NETWORK", message: "The client timed out after submission; the final processor outcome requires reconciliation." },
} as const;

export async function seedDemoTransactions(database: PrismaClient, now = new Date()) {
  await database.order.deleteMany({ where: { orderNumber: { startsWith: DEMO_PREFIX } } });
  let created = 0;

  for (let index = 0; index < 36; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const status = scenario === "SUCCESS" ? "SUCCEEDED" : scenario === "CLIENT_TIMEOUT_BACKEND_SUCCESS" ? "UNKNOWN" : "FAILED";
    const createdAt = new Date(now.getTime() - (35 - index) * 2 * 60 * 60 * 1_000);
    const latencyMs = status === "UNKNOWN" ? null : 240 + ((index * 347) % 3_550);
    const completedAt = latencyMs === null ? null : new Date(createdAt.getTime() + latencyMs);
    const finalAt = completedAt ?? new Date(createdAt.getTime() + 4_200);
    const amountCents = 6_500 + ((index * 1_137) % 24_000);
    const failure = scenario === "SUCCESS" ? null : failureDetails[scenario];
    const orderNumber = `${DEMO_PREFIX}${String(index + 1).padStart(4, "0")}`;

    const order = await database.order.create({
      data: {
        orderNumber,
        subtotalCents: amountCents - 700,
        taxCents: 700,
        totalCents: amountCents,
        status,
        createdAt,
        updatedAt: finalAt,
      },
    });
    const attempt = await database.paymentAttempt.create({
      data: {
        orderId: order.id,
        idempotencyKey: `demo-reliability-key-${index + 1}`,
        scenario,
        status,
        amountCents,
        processorReference: scenario === "MERCHANT_VALIDATION_FAILURE" || scenario === "PROCESSOR_FAILURE" ? null : `sim_demo_${String(index + 1).padStart(4, "0")}`,
        processorOutcome: status === "UNKNOWN" ? null : status,
        processorAvailableAt: status === "UNKNOWN" ? new Date(now.getTime() + (index + 1) * 60_000) : null,
        processorCompletedAt: completedAt,
        errorCode: failure?.code,
        errorCategory: failure?.category,
        errorMessage: failure?.message,
        createdAt: new Date(createdAt.getTime() + 80),
        updatedAt: finalAt,
      },
    });

    await database.paymentEvent.createMany({
      data: [
        { orderId: order.id, type: "ORDER_CREATED", message: "A synthetic demonstration order was created.", createdAt },
        { orderId: order.id, attemptId: attempt.id, type: "PAYMENT_STARTED", message: `Simulated payment started for ${amountCents} cents.`, createdAt: new Date(createdAt.getTime() + 80) },
        {
          orderId: order.id,
          attemptId: attempt.id,
          type: status === "SUCCEEDED" ? "SIMULATED_CHARGE_CREATED" : status === "UNKNOWN" ? "PAYMENT_OUTCOME_UNKNOWN" : "PAYMENT_FAILED",
          message: status === "SUCCEEDED" ? "The simulated processor confirmed one charge." : failure!.message,
          createdAt: finalAt,
        },
      ],
    });

    if (status === "SUCCEEDED") {
      await database.simulatedCharge.create({
        data: { orderId: order.id, attemptId: attempt.id, processorReference: `sim_demo_${String(index + 1).padStart(4, "0")}`, amountCents, createdAt: finalAt },
      });
      if (index % 5 === 0) {
        await database.paymentEvent.create({
          data: {
            orderId: order.id,
            attemptId: attempt.id,
            type: index % 10 === 0 ? "DUPLICATE_REUSED" : "DUPLICATE_BLOCKED",
            message: "Duplicate charge prevented — existing payment confirmed.",
            createdAt: new Date(finalAt.getTime() + 90),
          },
        });
      }
    }
    if (status === "UNKNOWN") {
      await database.paymentEvent.create({
        data: {
          orderId: order.id,
          attemptId: attempt.id,
          type: "RECONCILIATION_PENDING",
          message: "The original processor operation remains pending. No new charge was created.",
          createdAt: new Date(finalAt.getTime() + 140),
        },
      });
    }
    created += 1;
  }
  return { created, prefix: DEMO_PREFIX };
}
