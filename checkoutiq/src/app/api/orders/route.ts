import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  const order = await db.order.create({
    data: {
      orderNumber: `CIQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      subtotalCents: 12_900,
      taxCents: 1_103,
      totalCents: 14_003,
      events: { create: { type: "ORDER_CREATED", message: "A new simulated checkout order was created." } },
    },
  });
  return NextResponse.json({ order }, { status: 201 });
}
