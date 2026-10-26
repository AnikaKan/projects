import { describe, expect, it, vi } from "vitest";
import { ExperimentOSClient } from "../src/index";

describe("ExperimentOSClient", () => {
  it("normalizes the service base URL", () => {
    const client = new ExperimentOSClient({
      baseUrl: "https://example.test/",
      serviceCredential: "test-only",
    });
    expect(client.baseUrl).toBe("https://example.test");
    expect(JSON.stringify(client)).not.toContain("test-only");
  });

  it("reports API health without sending its credential", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new ExperimentOSClient({
      baseUrl: "https://example.test",
      serviceCredential: "never-send-for-health",
    });
    await expect(client.health()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/health/live", {
      signal: undefined,
    });
    fetchMock.mockRestore();
  });
});
