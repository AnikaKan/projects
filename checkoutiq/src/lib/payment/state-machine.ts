import type { PaymentStatus } from "./types";

const allowedTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ["PROCESSING"],
  PROCESSING: ["SUCCEEDED", "FAILED", "UNKNOWN"],
  UNKNOWN: ["SUCCEEDED", "FAILED"],
  FAILED: ["PROCESSING"],
  SUCCEEDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus) {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus) {
  if (!canTransition(from, to)) throw new Error(`Invalid payment transition: ${from} → ${to}`);
}
