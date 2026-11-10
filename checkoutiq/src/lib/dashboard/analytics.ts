import type { PaymentStatus } from "@/lib/payment/types";

export type DashboardEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export type DashboardTransaction = {
  id: string;
  orderNumber: string;
  status: PaymentStatus;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
  attemptId?: string;
  scenario?: string;
  errorCode?: string | null;
  errorCategory?: string | null;
  errorMessage?: string | null;
  latencyMs: number | null;
  duplicateRequestsHandled: number;
  simulatedChargeCount: number;
  explanation: string;
  recommendedAction: string;
  events: DashboardEvent[];
};

const categoryColors: Record<string, string> = {
  ISSUER_DECLINE: "#b95f54",
  PROCESSOR: "#c78a38",
  NETWORK: "#657fb4",
  INTEGRATION: "#836ca8",
  IDEMPOTENCY: "#3d7b5a",
  OTHER: "#8a928d",
};

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export function calculateDashboardAnalytics(transactions: DashboardTransaction[]) {
  const total = transactions.length;
  const succeeded = transactions.filter((item) => item.status === "SUCCEEDED").length;
  const failed = transactions.filter((item) => item.status === "FAILED").length;
  const unknown = transactions.filter((item) => item.status === "UNKNOWN").length;
  const processing = transactions.filter((item) => item.status === "PROCESSING").length;
  const duplicateRequestsHandled = transactions.reduce((sum, item) => sum + item.duplicateRequestsHandled, 0);
  const latencies = transactions
    .map((item) => item.latencyMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const averageLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : 0;
  const p95LatencyMs = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0;

  const errorCounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.errorCategory) {
      errorCounts.set(transaction.errorCategory, (errorCounts.get(transaction.errorCategory) ?? 0) + 1);
    }
  }
  const errorTotal = [...errorCounts.values()].reduce((sum, value) => sum + value, 0);
  const errorCategories = [...errorCounts.entries()]
    .map(([category, count]) => ({
      category,
      count,
      percentage: errorTotal ? round((count / errorTotal) * 100) : 0,
      color: categoryColors[category] ?? categoryColors.OTHER,
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const latencyRanges = [
    { label: "< 500ms", min: 0, max: 500 },
    { label: "0.5–1s", min: 500, max: 1_000 },
    { label: "1–2s", min: 1_000, max: 2_000 },
    { label: "2–3s", min: 2_000, max: 3_000 },
    { label: "3s+", min: 3_000, max: Number.POSITIVE_INFINITY },
  ];
  const latencyDistribution = latencyRanges.map((range) => ({
    label: range.label,
    count: latencies.filter((value) => value >= range.min && value < range.max).length,
  }));

  const bucketMs = 12 * 60 * 60 * 1_000;
  const trendBuckets = new Map<number, DashboardTransaction[]>();
  for (const transaction of transactions) {
    const timestamp = new Date(transaction.createdAt).getTime();
    const bucket = Math.floor(timestamp / bucketMs) * bucketMs;
    trendBuckets.set(bucket, [...(trendBuckets.get(bucket) ?? []), transaction]);
  }
  const reliabilityTrend = [...trendBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timestamp, items]) => {
      const successes = items.filter((item) => item.status === "SUCCEEDED").length;
      return {
        timestamp: new Date(timestamp).toISOString(),
        label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" }).format(timestamp),
        volume: items.length,
        successRate: items.length ? round((successes / items.length) * 100) : 0,
      };
    });

  return {
    metrics: {
      total,
      succeeded,
      successRate: total ? round((succeeded / total) * 100) : 0,
      failed,
      unknown,
      processing,
      pendingReconciliation: unknown,
      duplicateRequestsHandled,
      averageLatencyMs,
      p95LatencyMs,
    },
    errorCategories,
    latencyDistribution,
    reliabilityTrend,
  };
}

export function failureGuidance(status: PaymentStatus, errorCode?: string | null) {
  if (status === "UNKNOWN") {
    return {
      explanation: "The client lost confirmation after submission, so the final processor outcome is not yet proven.",
      action: "Reconcile the original processor operation. Do not create a replacement charge while status is unknown.",
    };
  }
  switch (errorCode) {
    case "BANK_HARD_DECLINE":
      return {
        explanation: "The simulated issuer definitively declined the authorization; no charge was created.",
        action: "Ask the customer to use another payment method. Do not retry the same method automatically.",
      };
    case "MERCHANT_VALIDATION_FAILED":
      return {
        explanation: "Merchant validation failed before the payment could reach authorization.",
        action: "Inspect merchant configuration and validation logs, then retry only after remediation.",
      };
    case "PROCESSOR_UNAVAILABLE":
      return {
        explanation: "The processor was unavailable before accepting the payment request.",
        action: "Apply bounded backoff and open an explicit retry only after processor health recovers.",
      };
    default:
      return status === "SUCCEEDED"
        ? { explanation: "The processor confirmed the simulated charge and the order is safe to fulfill.", action: "Fulfill once and keep the order terminal to prevent another charge." }
        : { explanation: "The payment has not reached a definitive successful state.", action: "Review the event history before deciding whether a controlled retry is safe." };
  }
}
