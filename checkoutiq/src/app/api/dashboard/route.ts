import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateDashboardAnalytics, failureGuidance, type DashboardTransaction } from "@/lib/dashboard/analytics";
import { seedDemoTransactions } from "@/lib/dashboard/demo-seed";
import { isPaymentStatus } from "@/lib/payment/types";

async function dashboardPayload() {
  const orders = await db.order.findMany({
    include: {
      paymentAttempts: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
      simulatedCharge: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const transactions: DashboardTransaction[] = orders.flatMap((order) => {
    if (!isPaymentStatus(order.status)) return [];
    const attempt = order.paymentAttempts[0];
    if (!attempt) return [];
    const guidance = failureGuidance(order.status, attempt?.errorCode);
    const completion = attempt?.processorCompletedAt ?? (order.status === "FAILED" ? attempt?.updatedAt : null);
    return [{
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      amountCents: order.totalCents,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      attemptId: attempt.id,
      scenario: attempt.scenario,
      errorCode: attempt.errorCode,
      errorCategory: attempt.errorCategory,
      errorMessage: attempt.errorMessage,
      latencyMs: completion ? Math.max(0, completion.getTime() - attempt.createdAt.getTime()) : null,
      duplicateRequestsHandled: order.events.filter((event) => event.type.includes("DUPLICATE")).length,
      simulatedChargeCount: order.simulatedCharge ? 1 : 0,
      explanation: guidance.explanation,
      recommendedAction: guidance.action,
      events: order.events.map((event) => ({ id: event.id, type: event.type, message: event.message, createdAt: event.createdAt.toISOString() })),
    }];
  });
  return { generatedAt: new Date().toISOString(), transactions, ...calculateDashboardAnalytics(transactions) };
}

export async function GET() {
  return NextResponse.json(await dashboardPayload());
}

export async function POST() {
  const seeded = await seedDemoTransactions(db);
  return NextResponse.json({ seeded, ...(await dashboardPayload()) }, { status: 201 });
}
