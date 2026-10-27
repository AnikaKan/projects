import type { paths } from "@experimentos/api-client";

export type HealthResponse =
  paths["/health/live"]["get"]["responses"][200]["content"]["application/json"];

export type ExperimentResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/experiments"]["get"]["responses"][200]["content"]["application/json"][number];

export type CohortSnapshotResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/quality"]["get"]["responses"][200]["content"]["application/json"];

export type AnalysisSnapshotResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/analysis"]["get"]["responses"][200]["content"]["application/json"];

export type DecisionResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/experiments/{experiment_id}/decisions"]["get"]["responses"][200]["content"]["application/json"][number];

export type AuditRecordResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/audit"]["get"]["responses"][200]["content"]["application/json"][number];

export type OperationalStatusResponse =
  paths["/v1/projects/{project_id}/environments/{environment_id}/operations/status"]["get"]["responses"][200]["content"]["application/json"];

export interface LocalScopeConfiguration {
  apiBaseUrl: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  subject: string;
}

export function localScopeConfiguration(): LocalScopeConfiguration | null {
  const organizationId = process.env.LOCAL_ORGANIZATION_ID;
  const projectId = process.env.EXPERIMENTOS_PROJECT_ID;
  const environmentId = process.env.EXPERIMENTOS_ENVIRONMENT_ID;
  if (!organizationId || !projectId || !environmentId) return null;
  return {
    apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:8000",
    organizationId,
    projectId,
    environmentId,
    subject:
      process.env.LOCAL_OPERATOR_SUBJECT ?? "portfolio-owner@example.test",
  };
}

export function localOperatorHeaders(role: string): Record<string, string> {
  const configuration = localScopeConfiguration();
  if (!configuration) throw new Error("local operator scope is not configured");
  return {
    "Content-Type": "application/json",
    "X-Local-Subject": configuration.subject,
    "X-Local-Organization-ID": configuration.organizationId,
    "X-Local-Role": role,
  };
}

export function experimentsPath(
  configuration: LocalScopeConfiguration,
): string {
  return `/v1/projects/${configuration.projectId}/environments/${configuration.environmentId}/experiments`;
}

export function scopePath(configuration: LocalScopeConfiguration): string {
  return `/v1/projects/${configuration.projectId}/environments/${configuration.environmentId}`;
}

export async function readApiHealth(): Promise<HealthResponse | null> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  try {
    const response = await fetch(`${baseUrl}/health/live`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function readExperiments(): Promise<ExperimentResponse[]> {
  const configuration = localScopeConfiguration();
  if (!configuration) return [];
  try {
    const response = await fetch(
      `${configuration.apiBaseUrl}${experimentsPath(configuration)}`,
      {
        headers: localOperatorHeaders("viewer"),
        cache: "no-store",
      },
    );
    if (!response.ok) return [];
    return (await response.json()) as ExperimentResponse[];
  } catch {
    return [];
  }
}

export async function readExperimentQualities(
  experiments: ExperimentResponse[],
): Promise<Record<string, CohortSnapshotResponse | null>> {
  const configuration = localScopeConfiguration();
  if (!configuration) return {};
  const entries = await Promise.all(
    experiments.map(async (experiment) => {
      try {
        const response = await fetch(
          `${configuration.apiBaseUrl}${experimentsPath(configuration)}/${experiment.id}/quality`,
          {
            headers: localOperatorHeaders("viewer"),
            cache: "no-store",
          },
        );
        if (!response.ok) return [experiment.id, null] as const;
        return [
          experiment.id,
          (await response.json()) as CohortSnapshotResponse,
        ] as const;
      } catch {
        return [experiment.id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function readExperimentAnalyses(
  experiments: ExperimentResponse[],
): Promise<Record<string, AnalysisSnapshotResponse | null>> {
  const configuration = localScopeConfiguration();
  if (!configuration) return {};
  const entries = await Promise.all(
    experiments.map(async (experiment) => {
      try {
        const response = await fetch(
          `${configuration.apiBaseUrl}${experimentsPath(configuration)}/${experiment.id}/analysis`,
          { headers: localOperatorHeaders("viewer"), cache: "no-store" },
        );
        if (!response.ok) return [experiment.id, null] as const;
        return [
          experiment.id,
          (await response.json()) as AnalysisSnapshotResponse,
        ] as const;
      } catch {
        return [experiment.id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function readExperimentDecisions(
  experiments: ExperimentResponse[],
): Promise<Record<string, DecisionResponse[]>> {
  const configuration = localScopeConfiguration();
  if (!configuration) return {};
  const entries = await Promise.all(
    experiments.map(async (experiment) => {
      try {
        const response = await fetch(
          `${configuration.apiBaseUrl}${experimentsPath(configuration)}/${experiment.id}/decisions`,
          { headers: localOperatorHeaders("viewer"), cache: "no-store" },
        );
        if (!response.ok) return [experiment.id, []] as const;
        return [
          experiment.id,
          (await response.json()) as DecisionResponse[],
        ] as const;
      } catch {
        return [experiment.id, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function readAuditRecords(): Promise<AuditRecordResponse[]> {
  const configuration = localScopeConfiguration();
  if (!configuration) return [];
  try {
    const response = await fetch(
      `${configuration.apiBaseUrl}${scopePath(configuration)}/audit`,
      { headers: localOperatorHeaders("viewer"), cache: "no-store" },
    );
    if (!response.ok) return [];
    return (await response.json()) as AuditRecordResponse[];
  } catch {
    return [];
  }
}

export async function readOperationalStatus(): Promise<OperationalStatusResponse | null> {
  const configuration = localScopeConfiguration();
  if (!configuration) return null;
  try {
    const response = await fetch(
      `${configuration.apiBaseUrl}${scopePath(configuration)}/operations/status`,
      { headers: localOperatorHeaders("viewer"), cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as OperationalStatusResponse;
  } catch {
    return null;
  }
}
