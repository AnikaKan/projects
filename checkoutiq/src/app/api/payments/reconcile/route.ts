import { NextResponse } from "next/server";
import { reconcilePayment } from "@/lib/payment/payment-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.orderId !== "string") {
      return NextResponse.json({ error: "A valid order ID is required." }, { status: 400 });
    }
    return NextResponse.json({ result: await reconcilePayment(body.orderId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed." }, { status: 500 });
  }
}
