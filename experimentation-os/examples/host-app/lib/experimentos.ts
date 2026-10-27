import { randomUUID } from "node:crypto";
import {
  type AssignmentResult,
  type EventRecordResult,
  ExperimentOSClient,
  FileEventOutbox,
} from "@experimentos/sdk-node";

interface HostContext {
  client: ExperimentOSClient;
  outbox: FileEventOutbox;
  subjectId: string;
}

function context(): HostContext | null {
  const {
    EXPERIMENTOS_API_URL,
    EXPERIMENTOS_SERVICE_CREDENTIAL,
    EXPERIMENTOS_PROJECT_ID,
    EXPERIMENTOS_ENVIRONMENT_ID,
  } = process.env;
  if (
    !EXPERIMENTOS_API_URL ||
    !EXPERIMENTOS_SERVICE_CREDENTIAL ||
    !EXPERIMENTOS_PROJECT_ID ||
    !EXPERIMENTOS_ENVIRONMENT_ID
  )
    return null;
  return {
    client: new ExperimentOSClient({
      baseUrl: EXPERIMENTOS_API_URL,
      serviceCredential: EXPERIMENTOS_SERVICE_CREDENTIAL,
      projectId: EXPERIMENTOS_PROJECT_ID,
      environmentId: EXPERIMENTOS_ENVIRONMENT_ID,
    }),
    outbox: new FileEventOutbox(
      process.env.EXPERIMENTOS_OUTBOX_DIRECTORY ?? "/tmp/experimentos-outbox",
    ),
    subjectId: process.env.DEMO_SUBJECT_ID ?? "visitor-1001",
  };
}

export async function resolveHostAssignment(): Promise<{
  context: HostContext;
  result: AssignmentResult;
} | null> {
  const active = context();
  if (!active) return null;
  const result = await active.client.resolveAssignment({
    experimentKey: process.env.EXPERIMENTOS_EXPERIMENT_KEY ?? "signup-message",
    subjectId: active.subjectId,
    attributes: { market: process.env.DEMO_MARKET ?? "US" },
  });
  return { context: active, result };
}

export async function recordHostEvent(
  eventType: "exposure" | "completed_signup",
): Promise<EventRecordResult | null> {
  const resolved = await resolveHostAssignment();
  if (resolved?.result.state !== "assigned") return null;
  const eventId = randomUUID();
  return resolved.context.client.recordEvent(resolved.context.outbox, {
    eventId,
    assignmentId: resolved.result.assignmentId,
    assignmentToken: resolved.result.assignmentToken,
    eventType,
    occurredAt: new Date().toISOString(),
    sourceIdentity: resolved.context.subjectId,
    correlationId: randomUUID(),
    payload: { surface: "host-example" },
  });
}
