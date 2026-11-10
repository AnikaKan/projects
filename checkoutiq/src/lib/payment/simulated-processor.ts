import { createHash } from "node:crypto";
import type { PaymentScenario, ProcessorResult } from "./types";

function referenceFor(idempotencyKey: string) {
  return `sim_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

export async function runSimulatedProcessor(
  scenario: PaymentScenario,
  idempotencyKey: string,
): Promise<ProcessorResult> {
  const processorReference = referenceFor(idempotencyKey);
  const effectiveScenario =
    scenario === "DUPLICATE_REQUEST" || scenario === "CONCURRENT_DUPLICATE_REQUESTS"
      ? "SUCCESS"
      : scenario;

  switch (effectiveScenario) {
    case "SUCCESS":
      return { visibleStatus: "SUCCEEDED", processorOutcome: "SUCCEEDED", processorReference };
    case "HARD_DECLINE":
      return {
        visibleStatus: "FAILED",
        processorOutcome: "FAILED",
        errorCode: "BANK_HARD_DECLINE",
        errorCategory: "ISSUER_DECLINE",
        errorMessage: "The simulated issuing bank declined this payment.",
      };
    case "MERCHANT_VALIDATION_FAILURE":
      return {
        visibleStatus: "FAILED",
        processorOutcome: "FAILED",
        errorCode: "MERCHANT_VALIDATION_FAILED",
        errorCategory: "INTEGRATION",
        errorMessage: "The simulated merchant session could not be validated.",
      };
    case "PROCESSOR_FAILURE":
      return {
        visibleStatus: "FAILED",
        processorOutcome: "FAILED",
        errorCode: "PROCESSOR_UNAVAILABLE",
        errorCategory: "PROCESSOR",
        errorMessage: "The simulated processor was unavailable before accepting the payment.",
      };
    case "CLIENT_TIMEOUT_BACKEND_SUCCESS":
      return {
        visibleStatus: "UNKNOWN",
        processorReference,
        errorCode: "CLIENT_TIMEOUT",
        errorCategory: "NETWORK",
        errorMessage: "The client timed out after submission; the final processor outcome requires reconciliation.",
      };
  }
}
