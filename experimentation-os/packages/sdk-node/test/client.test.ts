import { describe, expect, it, vi } from "vitest";
import { ExperimentOSClient } from "../src/index";

describe("ExperimentOSClient", () => {
  it("normalizes the service base URL", () => {
    const client = new ExperimentOSClient({
      baseUrl: "https://example.test/",
      serviceCredential: "test-only",
      projectId: "project",
      environmentId: "environment",
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
      projectId: "project",
      environmentId: "environment",
    });
    await expect(client.health()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/health/live", {
      signal: undefined,
    });
    fetchMock.mockRestore();
  });

  it("returns a real server assignment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          state: "assigned",
          arm: "treatment",
          assignment_id: "a-1",
          assignment_token: "eat_token",
          existing: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ExperimentOSClient({
      baseUrl: "https://example.test",
      serviceCredential: "secret",
      projectId: "p",
      environmentId: "e",
    });
    await expect(
      client.resolveAssignment({
        experimentKey: "welcome",
        subjectId: "person-1",
      }),
    ).resolves.toEqual({
      state: "assigned",
      arm: "treatment",
      assignmentId: "a-1",
      assignmentToken: "eat_token",
      existing: false,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer secret" }),
    );
    fetchMock.mockRestore();
  });

  it("fails safely instead of fabricating a control assignment", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
    const client = new ExperimentOSClient({
      baseUrl: "https://example.test",
      serviceCredential: "secret",
      projectId: "p",
      environmentId: "e",
      retries: 1,
      timeoutMs: 20,
    });
    await expect(
      client.resolveAssignment({
        experimentKey: "welcome",
        subjectId: "person-1",
      }),
    ).resolves.toEqual({
      state: "unavailable",
      reason: "assignment service unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
