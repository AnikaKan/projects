import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ExperimentEvent,
  ExperimentOSClient,
  FileEventOutbox,
} from "../src/index";

const directories: string[] = [];

async function outbox(): Promise<FileEventOutbox> {
  const directory = await mkdtemp(path.join(tmpdir(), "experimentos-outbox-"));
  directories.push(directory);
  return new FileEventOutbox(directory);
}

function event(eventId: string): ExperimentEvent {
  return {
    eventId,
    assignmentId: "assignment-1",
    assignmentToken: "eat_test",
    eventType: "exposure",
    occurredAt: "2026-10-26T10:00:00.000Z",
    sourceIdentity: "subject-1",
    correlationId: "request-1",
    payload: { surface: "landing" },
  };
}

function client(retries = 0): ExperimentOSClient {
  return new ExperimentOSClient({
    baseUrl: "https://example.test",
    serviceCredential: "secret",
    projectId: "project",
    environmentId: "environment",
    retries,
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("FileEventOutbox", () => {
  it("survives a host restart with the same pending event", async () => {
    const first = await outbox();
    await first.store(event("evt-restart"));
    const directory = directories[0];
    if (!directory) throw new Error("test directory missing");
    const restarted = new FileEventOutbox(directory);
    await expect(restarted.pending()).resolves.toEqual([event("evt-restart")]);
  });

  it("retries an ambiguous publication with the same event ID", async () => {
    const durable = await outbox();
    await durable.store(event("evt-ambiguous"));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("timeout after possible acceptance"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accepted_count: 1,
            failed_count: 0,
            results: [
              { event_id: "evt-ambiguous", accepted: true, status_code: 202 },
            ],
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      );
    await expect(client(1).flushOutbox(durable)).resolves.toEqual({
      acceptedEventIds: ["evt-ambiguous"],
      pendingEventIds: [],
    });
    const firstBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    const secondBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(firstBody).toBe(secondBody);
    expect(firstBody).toContain("evt-ambiguous");
    await expect(durable.pending()).resolves.toEqual([]);
  });

  it("removes only accepted items from a partial batch", async () => {
    const durable = await outbox();
    await durable.store(event("evt-accepted"));
    await durable.store(event("evt-pending"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted_count: 1,
          failed_count: 1,
          results: [
            { event_id: "evt-accepted", accepted: true, status_code: 202 },
            { event_id: "evt-pending", accepted: false, status_code: 503 },
          ],
        }),
        { status: 207, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(client().flushOutbox(durable)).resolves.toEqual({
      acceptedEventIds: ["evt-accepted"],
      pendingEventIds: ["evt-pending"],
    });
    await expect(durable.pending()).resolves.toEqual([event("evt-pending")]);
  });

  it("reports local persistence separately when the collector is unavailable", async () => {
    const durable = await outbox();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(
      client().recordEvent(durable, event("evt-local")),
    ).resolves.toEqual({
      state: "stored_locally",
      eventId: "evt-local",
      reason: "remote durable acceptance was not confirmed",
    });
    await expect(durable.pending()).resolves.toEqual([event("evt-local")]);
  });
});
