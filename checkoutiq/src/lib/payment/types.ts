export const paymentStatuses = [
  "CREATED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "UNKNOWN",
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentScenarios = [
  "SUCCESS",
  "HARD_DECLINE",
  "MERCHANT_VALIDATION_FAILURE",
  "PROCESSOR_FAILURE",
  "CLIENT_TIMEOUT_BACKEND_SUCCESS",
  "DUPLICATE_REQUEST",
  "CONCURRENT_DUPLICATE_REQUESTS",
] as const;

export type PaymentScenario = (typeof paymentScenarios)[number];

export type ProcessorResult = {
  visibleStatus: "SUCCEEDED" | "FAILED" | "UNKNOWN";
  processorOutcome?: "SUCCEEDED" | "FAILED";
  processorReference?: string;
  errorCode?: string;
  errorCategory?: string;
  errorMessage?: string;
};

export type PaymentServiceResult = {
  orderId: string;
  orderStatus: PaymentStatus;
  attemptId?: string;
  attemptStatus?: PaymentStatus;
  idempotencyKey: string;
  reused: boolean;
  duplicatesPrevented: number;
  simulatedChargeCount: number;
  blockedReason?: string;
  message?: string;
};

export function isPaymentScenario(value: unknown): value is PaymentScenario {
  return typeof value === "string" && paymentScenarios.includes(value as PaymentScenario);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus);
}
