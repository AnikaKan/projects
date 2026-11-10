import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "@/lib/payment/state-machine";

describe("payment state machine", () => {
  it("allows only defined forward transitions", () => {
    expect(canTransition("CREATED", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "UNKNOWN")).toBe(true);
    expect(canTransition("UNKNOWN", "SUCCEEDED")).toBe(true);
    expect(canTransition("FAILED", "PROCESSING")).toBe(true);
  });

  it("makes success terminal and rejects unsafe transitions", () => {
    expect(canTransition("SUCCEEDED", "PROCESSING")).toBe(false);
    expect(() => assertTransition("UNKNOWN", "PROCESSING")).toThrow(
      "Invalid payment transition: UNKNOWN → PROCESSING",
    );
  });
});
