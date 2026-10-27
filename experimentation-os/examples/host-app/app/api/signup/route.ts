import { NextResponse } from "next/server";
import { recordHostEvent } from "../../../lib/experimentos";

export async function POST(request: Request) {
  const result = await recordHostEvent("completed_signup");
  const state = result?.state ?? "not_assigned";
  return NextResponse.redirect(
    new URL(`/?outcome=${encodeURIComponent(state)}`, request.url),
    303,
  );
}
