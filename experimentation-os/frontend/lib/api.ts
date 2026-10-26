import type { paths } from "@experimentos/api-client";

export type HealthResponse =
  paths["/health/live"]["get"]["responses"][200]["content"]["application/json"];

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
