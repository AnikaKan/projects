import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const order = await db.order.findUnique({ where: { id: orderId }, include: { paymentAttempts: { orderBy: { createdAt: "desc" } }, events: { orderBy: { createdAt: "desc" } }, simulatedCharge: true } });
  return order ? NextResponse.json({ order: { ...order, simulatedChargeCount: order.simulatedCharge ? 1 : 0 } }) : NextResponse.json({ error: "Order not found." }, { status: 404 });
}
