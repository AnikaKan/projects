export interface ExperimentOSClientOptions {
  baseUrl: string;
  serviceCredential: string;
  projectId: string;
  environmentId: string;
  timeoutMs?: number;
  retries?: number;
}

export type AssignmentResult =
  | {
      state: "assigned";
      arm: "control" | "treatment";
      assignmentId: string;
      assignmentToken: string;
      existing: boolean;
    }
  | {
      state:
        | "ineligible"
        | "out_of_traffic"
        | "not_running"
        | "enrollment_closed"
        | "disabled"
        | "unavailable";
      reason?: string;
    };

export interface ExperimentEvent {
  eventId: string;
  assignmentId: string;
  assignmentToken: string;
  eventType: string;
  occurredAt: string;
  sourceIdentity: string;
  correlationId: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface EventOutbox {
  store(event: ExperimentEvent): Promise<void>;
  pending(limit?: number): Promise<ExperimentEvent[]>;
  remove(eventId: string): Promise<void>;
}

export interface EventFlushResult {
  acceptedEventIds: string[];
  pendingEventIds: string[];
}

export type EventRecordResult =
  | { state: "accepted"; eventId: string }
  | { state: "stored_locally"; eventId: string; reason: string };

export class ExperimentOSError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExperimentOSError";
  }
}

export class ExperimentOSClient {
  readonly baseUrl: string;
  readonly #serviceCredential: string;
  readonly #projectId: string;
  readonly #environmentId: string;
  readonly #timeoutMs: number;
  readonly #retries: number;

  constructor(options: ExperimentOSClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#serviceCredential = options.serviceCredential;
    this.#projectId = options.projectId;
    this.#environmentId = options.environmentId;
    this.#timeoutMs = options.timeoutMs ?? 800;
    this.#retries = options.retries ?? 1;
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/health/live`, { signal });
    return response.ok;
  }

  async resolveAssignment(input: {
    experimentKey: string;
    subjectId: string;
    attributes?: Record<string, string>;
  }): Promise<AssignmentResult> {
    const url = `${this.baseUrl}/v1/projects/${encodeURIComponent(this.#projectId)}/environments/${encodeURIComponent(this.#environmentId)}/experiments/${encodeURIComponent(input.experimentKey)}/assignments/resolve`;
    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#serviceCredential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject_id: input.subjectId,
            attributes: input.attributes ?? {},
          }),
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (response.status === 401 || response.status === 403)
          throw new ExperimentOSError(
            response.status,
            "ExperimentOS credential was rejected",
          );
        if (response.status === 429 || response.status >= 500)
          throw new Error(`temporary ExperimentOS failure: ${response.status}`);
        if (!response.ok)
          throw new ExperimentOSError(
            response.status,
            `ExperimentOS request failed: ${response.status}`,
          );
        const value = (await response.json()) as {
          state: AssignmentResult["state"];
          arm?: "control" | "treatment";
          assignment_id?: string;
          assignment_token?: string;
          existing?: boolean;
          reason?: string;
        };
        if (
          value.state === "assigned" &&
          value.arm &&
          value.assignment_id &&
          value.assignment_token
        )
          return {
            state: "assigned",
            arm: value.arm,
            assignmentId: value.assignment_id,
            assignmentToken: value.assignment_token,
            existing: value.existing ?? false,
          };
        if (value.state === "unavailable")
          return { state: "unavailable", reason: "invalid server response" };
        return { state: value.state, reason: value.reason } as AssignmentResult;
      } catch (error) {
        if (error instanceof ExperimentOSError) throw error;
        if (attempt === this.#retries)
          return {
            state: "unavailable",
            reason: "assignment service unavailable",
          };
      }
    }
    return { state: "unavailable", reason: "assignment service unavailable" };
  }

  async flushOutbox(outbox: EventOutbox): Promise<EventFlushResult> {
    const events = await outbox.pending(100);
    if (events.length === 0)
      return { acceptedEventIds: [], pendingEventIds: [] };
    const url = `${this.baseUrl}/v1/projects/${encodeURIComponent(this.#projectId)}/environments/${encodeURIComponent(this.#environmentId)}/events:collect`;
    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#serviceCredential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            events: events.map((event) => ({
              event_id: event.eventId,
              schema_version: "1",
              assignment_id: event.assignmentId,
              assignment_token: event.assignmentToken,
              event_type: event.eventType,
              occurred_at: event.occurredAt,
              source_identity: event.sourceIdentity,
              correlation_id: event.correlationId,
              payload: event.payload ?? {},
            })),
          }),
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (response.status === 401 || response.status === 403)
          throw new ExperimentOSError(
            response.status,
            "ExperimentOS credential was rejected",
          );
        if (response.status === 429 || response.status >= 500)
          throw new Error(`temporary ExperimentOS failure: ${response.status}`);
        if (response.status !== 202 && response.status !== 207)
          throw new ExperimentOSError(
            response.status,
            `ExperimentOS event request failed: ${response.status}`,
          );
        const value = (await response.json()) as {
          results: Array<{ event_id: string; accepted: boolean }>;
        };
        const accepted = value.results
          .filter((result) => result.accepted)
          .map((result) => result.event_id);
        for (const eventId of accepted) await outbox.remove(eventId);
        return {
          acceptedEventIds: accepted,
          pendingEventIds: events
            .map((event) => event.eventId)
            .filter((eventId) => !accepted.includes(eventId)),
        };
      } catch (error) {
        if (error instanceof ExperimentOSError) throw error;
        if (attempt === this.#retries)
          return {
            acceptedEventIds: [],
            pendingEventIds: events.map((event) => event.eventId),
          };
      }
    }
    return {
      acceptedEventIds: [],
      pendingEventIds: events.map((event) => event.eventId),
    };
  }

  async recordEvent(
    outbox: EventOutbox,
    event: ExperimentEvent,
  ): Promise<EventRecordResult> {
    await outbox.store(event);
    const result = await this.flushOutbox(outbox);
    if (result.acceptedEventIds.includes(event.eventId))
      return { state: "accepted", eventId: event.eventId };
    return {
      state: "stored_locally",
      eventId: event.eventId,
      reason: "remote durable acceptance was not confirmed",
    };
  }
}

export { FileEventOutbox } from "./outbox.js";
