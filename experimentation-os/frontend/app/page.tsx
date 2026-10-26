import { readApiHealth } from "@/lib/api";

export default async function Home() {
  const health = await readApiHealth();
  return (
    <main>
      <p className="eyebrow">ExperimentOS</p>
      <h1>Operator console foundation</h1>
      <p>
        Day 1 establishes authenticated, environment-scoped service boundaries.
        Experiment setup and results arrive in later phases.
      </p>
      <section aria-labelledby="connection-heading">
        <h2 id="connection-heading">API connection</h2>
        <p className={health ? "healthy" : "unavailable"}>
          {health ? `Connected to ${health.service}` : "API is unavailable"}
        </p>
      </section>
    </main>
  );
}
