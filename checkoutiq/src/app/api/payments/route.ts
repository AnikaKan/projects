import { NextResponse } from "next/server";
import { IdempotencyConflictError, processPayment } from "@/lib/payment/payment-service";
import { isPaymentScenario } from "@/lib/payment/types";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.orderId !== "string" || typeof body.idempotencyKey !== "string" || !isPaymentScenario(body.scenario)) return NextResponse.json({ error: "Valid order, key, and scenario required." }, { status: 400 });
    const retryOfAttemptId = typeof body.retryOfAttemptId === "string" ? body.retryOfAttemptId : undefined;
    return NextResponse.json({ result: await processPayment({ orderId: body.orderId, idempotencyKey: body.idempotencyKey, scenario: body.scenario, retryOfAttemptId }) });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulation failed." }, { status: 500 });
  }
}
