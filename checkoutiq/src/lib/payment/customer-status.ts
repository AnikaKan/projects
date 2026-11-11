import type { PaymentStatus } from "./types";

export type CustomerStatusPresentation = {
  title: string;
  description: string;
  tone: "success" | "danger" | "warning";
} | null;

export function customerStatusFor(status?: PaymentStatus): CustomerStatusPresentation {
  switch (status) {
    case "PROCESSING":
      return { title: "Payment processing", description: "The original payment is still processing. CheckoutIQ is refreshing its persisted status.", tone: "warning" };
    case "SUCCEEDED":
      return { title: "Payment confirmed", description: "Your simulated order is confirmed. No additional payment can be created.", tone: "success" };
    case "FAILED":
      return { title: "Payment not completed", description: "The failure was confirmed. It is safe to try a new simulated payment attempt.", tone: "danger" };
    case "UNKNOWN":
      return { title: "Confirmation pending", description: "A timeout is not proof of failure. Reconcile before retrying.", tone: "warning" };
    default:
      return null;
  }
}
