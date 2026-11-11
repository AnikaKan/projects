import { describe, expect, it } from "vitest";
import { customerStatusFor } from "@/lib/payment/customer-status";

describe("customer payment status copy", () => {
  it("does not present PROCESSING or UNKNOWN as a failure", () => {
    expect(customerStatusFor("PROCESSING")).toMatchObject({ title: "Payment processing", tone: "warning" });
    expect(customerStatusFor("UNKNOWN")).toMatchObject({ title: "Confirmation pending", tone: "warning" });
  });

  it("uses definitive copy only for terminal states", () => {
    expect(customerStatusFor("SUCCEEDED")).toMatchObject({ title: "Payment confirmed", tone: "success" });
    expect(customerStatusFor("FAILED")).toMatchObject({ title: "Payment not completed", tone: "danger" });
    expect(customerStatusFor("CREATED")).toBeNull();
  });
});
