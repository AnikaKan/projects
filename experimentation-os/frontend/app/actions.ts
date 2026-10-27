"use server";

import { revalidatePath } from "next/cache";
import {
  experimentsPath,
  localOperatorHeaders,
  localScopeConfiguration,
  scopePath,
} from "@/lib/api";

async function mutate(
  suffix: string,
  role: "editor" | "approver" | "administrator",
  method: "POST" | "PUT",
  body: object,
): Promise<void> {
  const configuration = localScopeConfiguration();
  if (!configuration) throw new Error("local operator scope is not configured");
  const response = await fetch(
    `${configuration.apiBaseUrl}${experimentsPath(configuration)}${suffix}`,
    {
      method,
      headers: localOperatorHeaders(role),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ExperimentOS returned ${response.status}: ${detail}`);
  }
  revalidatePath("/");
}

async function mutateScope(
  suffix: string,
  role: "approver" | "administrator",
  body: object,
): Promise<void> {
  const configuration = localScopeConfiguration();
  if (!configuration) throw new Error("local operator scope is not configured");
  const response = await fetch(
    `${configuration.apiBaseUrl}${scopePath(configuration)}${suffix}`,
    {
      method: "POST",
      headers: localOperatorHeaders(role),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ExperimentOS returned ${response.status}: ${detail}`);
  }
  revalidatePath("/");
}

export async function createExperiment(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const hypothesis = String(formData.get("hypothesis") ?? "").trim();
  const trafficPercent = Number(formData.get("traffic_percent") ?? 100);
  const eligibilityValues = String(formData.get("eligibility_values") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const enrollmentEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await mutate("", "editor", "POST", {
    key,
    name,
    configuration: {
      identity_namespace: "recruiter-demo-subject",
      traffic_allocation_basis_points: Math.round(trafficPercent * 100),
      salt: `local-${crypto.randomUUID()}`,
      algorithm_version: "sha256-v1",
      arms: [
        { key: "control", allocation_basis_points: 5000 },
        { key: "treatment", allocation_basis_points: 5000 },
      ],
      eligibility:
        eligibilityValues.length > 0
          ? { attribute: "market", allowed_values: eligibilityValues }
          : null,
      safe_fallback: "unavailable",
    },
    analysis_plan: {
      hypothesis,
      primary_metric: { key: "completed_signup", kind: "binary" },
      guardrail_metric: { key: "crash", kind: "binary" },
      guardrail_harm_margin_percentage_points: 1,
      enrollment_ends_at: enrollmentEndsAt.toISOString(),
      followup_hours: 24,
      arrival_lateness_hours: 24,
      primary_alpha: 0.05,
      baseline_rate: 0.2,
      guardrail_baseline_rate: 0.01,
      minimum_detectable_effect_percentage_points: 2,
      desired_power: 0.8,
      practical_significance_threshold_percentage_points: 1,
      practical_threshold_semantics: "lower_confidence_bound_above",
      primary_test_method: "score",
      primary_interval_method: "score",
      score_correction: true,
      guardrail_one_sided_alpha: 0.05,
    },
  });
}

function transitionFields(formData: FormData): {
  id: string;
  expectedVersion: number;
} {
  return {
    id: String(formData.get("experiment_id")),
    expectedVersion: Number(formData.get("expected_version")),
  };
}

export async function approveExperiment(formData: FormData): Promise<void> {
  const { id, expectedVersion } = transitionFields(formData);
  await mutate(`/${id}/approve`, "approver", "POST", {
    expected_version: expectedVersion,
  });
}

export async function launchExperiment(formData: FormData): Promise<void> {
  const { id, expectedVersion } = transitionFields(formData);
  await mutate(`/${id}/launch`, "approver", "POST", {
    expected_version: expectedVersion,
  });
}

export async function closeEnrollment(formData: FormData): Promise<void> {
  const { id, expectedVersion } = transitionFields(formData);
  await mutate(`/${id}/close-enrollment`, "editor", "POST", {
    expected_version: expectedVersion,
  });
}

export async function disableExperiment(formData: FormData): Promise<void> {
  const { id, expectedVersion } = transitionFields(formData);
  await mutate(`/${id}/disable`, "administrator", "POST", {
    expected_version: expectedVersion,
    reason: "Emergency disable requested from the local operator console",
  });
}

export async function deriveQualitySnapshot(formData: FormData): Promise<void> {
  const id = String(formData.get("experiment_id"));
  await mutate(`/${id}/quality-snapshots`, "editor", "POST", {
    derivation_version: `cohort-console-${Date.now().toString(36)}`,
    event_derivation_version: "events-v1",
  });
}

export async function deriveAnalysisSnapshot(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("experiment_id"));
  const cohortSnapshotId = String(formData.get("cohort_snapshot_id"));
  await mutate(`/${id}/analysis-snapshots`, "approver", "POST", {
    cohort_snapshot_id: cohortSnapshotId,
    analysis_version: "analysis-v1",
  });
}

export async function recordDecision(formData: FormData): Promise<void> {
  const experimentId = String(formData.get("experiment_id"));
  const snapshotId = String(formData.get("snapshot_id"));
  const action = String(formData.get("decision_action"));
  const rationale = String(formData.get("rationale") ?? "").trim();
  const rolloutReference = String(
    formData.get("rollout_reference") ?? "",
  ).trim();
  await mutateScope(
    `/experiments/${experimentId}/analysis/${snapshotId}/decisions`,
    "approver",
    {
      action,
      rationale,
      rollout_reference: rolloutReference || null,
    },
  );
}

export async function invalidateAnalysis(formData: FormData): Promise<void> {
  const experimentId = String(formData.get("experiment_id"));
  const snapshotId = String(formData.get("snapshot_id"));
  const reason = String(formData.get("invalidation_reason") ?? "").trim();
  await mutateScope(
    `/experiments/${experimentId}/analysis/${snapshotId}/invalidate`,
    "administrator",
    { reason },
  );
}

export async function deliverTestAlert(formData: FormData): Promise<void> {
  const recipientLabel = String(formData.get("recipient_label") ?? "").trim();
  await mutateScope("/operations/test-alert", "administrator", {
    recipient_label: recipientLabel,
  });
}
