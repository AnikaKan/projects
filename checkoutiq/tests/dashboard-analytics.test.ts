import { describe, expect, it } from "vitest";
import { calculateDashboardAnalytics, failureGuidance, type DashboardTransaction } from "@/lib/dashboard/analytics";

const base = {
  amountCents: 10_000,
  updatedAt: "2026-11-09T01:00:02.000Z",
  attemptId: "attempt",
  scenario: "SUCCESS",
  errorCode: null,
  errorCategory: null,
  errorMessage: null,
  simulatedChargeCount: 1,
  explanation: "explanation",
  recommendedAction: "action",
  events: [],
};

function transaction(overrides: Partial<DashboardTransaction> & Pick<DashboardTransaction, "id" | "status" | "createdAt">): DashboardTransaction {
  return { ...base, orderNumber: `ORDER-${overrides.id}`, latencyMs: 500, duplicateRequestsHandled: 0, ...overrides };
}

describe("dashboard analytics", () => {
  it("calculates every KPI from transaction records", () => {
    const result = calculateDashboardAnalytics([
      transaction({ id: "1", status: "SUCCEEDED", createdAt: "2026-11-08T01:00:00.000Z", latencyMs: 200, duplicateRequestsHandled: 2 }),
      transaction({ id: "2", status: "SUCCEEDED", createdAt: "2026-11-08T02:00:00.000Z", latencyMs: 800, duplicateRequestsHandled: 1 }),
      transaction({ id: "3", status: "FAILED", createdAt: "2026-11-08T14:00:00.000Z", latencyMs: 2_000, errorCategory: "ISSUER_DECLINE", errorCode: "BANK_HARD_DECLINE", simulatedChargeCount: 0 }),
      transaction({ id: "4", status: "UNKNOWN", createdAt: "2026-11-08T15:00:00.000Z", latencyMs: null, errorCategory: "NETWORK", errorCode: "CLIENT_TIMEOUT", simulatedChargeCount: 0 }),
    ]);

    expect(result.metrics).toEqual({
      total: 4,
      succeeded: 2,
      successRate: 50,
      failed: 1,
      unknown: 1,
      processing: 0,
      pendingReconciliation: 1,
      duplicateRequestsHandled: 3,
      averageLatencyMs: 1_000,
      p95LatencyMs: 2_000,
    });
    expect(result.errorCategories).toEqual([
      expect.objectContaining({ category: "ISSUER_DECLINE", count: 1, percentage: 50 }),
      expect.objectContaining({ category: "NETWORK", count: 1, percentage: 50 }),
    ]);
    expect(result.latencyDistribution.map((bucket) => bucket.count)).toEqual([1, 1, 0, 1, 0]);
    expect(result.reliabilityTrend).toHaveLength(2);
  });

  it("returns payment-specific recovery guidance", () => {
    expect(failureGuidance("FAILED", "BANK_HARD_DECLINE").action).toContain("another payment method");
    expect(failureGuidance("FAILED", "MERCHANT_VALIDATION_FAILED").action).toContain("configuration");
    expect(failureGuidance("UNKNOWN", "CLIENT_TIMEOUT").action).toContain("Do not create a replacement charge");
  });
});
