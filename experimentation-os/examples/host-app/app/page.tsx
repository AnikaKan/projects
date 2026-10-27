import { recordHostEvent, resolveHostAssignment } from "../lib/experimentos";

export const dynamic = "force-dynamic";

export default async function HostExample({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>;
}) {
  const resolved = await resolveHostAssignment();
  const result = resolved?.result ?? null;
  const assigned = result?.state === "assigned";
  const exposure = assigned ? await recordHostEvent("exposure") : null;
  const outcome = (await searchParams).outcome;
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "80px auto",
        padding: 32,
        fontFamily: "system-ui",
        color: "#17211d",
      }}
    >
      <p
        style={{
          color: "#287052",
          fontWeight: 800,
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}
      >
        Real host example
      </p>
      <h1>
        {assigned && result.arm === "treatment"
          ? "Start making better product decisions."
          : "Learn what works for your customers."}
      </h1>
      <p>
        This page asks ExperimentOS for a server-side assignment before
        rendering. Its credential never enters the browser bundle.
      </p>
      {result === null && (
        <p style={{ padding: 16, background: "#f3f0e8" }}>
          Add the local service credential environment variable to connect this
          example.
        </p>
      )}
      {result && !assigned && (
        <p style={{ padding: 16, background: "#f3f0e8" }}>
          Safe baseline shown. Experiment state: <strong>{result.state}</strong>
          . No control assignment was invented.
        </p>
      )}
      {assigned && (
        <p style={{ padding: 16, background: "#deeee6" }}>
          Assigned to <strong>{result.arm}</strong> · assignment{" "}
          {result.assignmentId.slice(0, 8)}…
        </p>
      )}
      {exposure && (
        <p>
          Exposure delivery: <strong>{exposure.state}</strong>
        </p>
      )}
      {outcome && (
        <p>
          Outcome delivery: <strong>{outcome}</strong>
        </p>
      )}
      <form action="/api/signup" method="post">
        <button
          type="submit"
          style={{
            marginTop: 18,
            border: 0,
            borderRadius: 9,
            padding: "12px 18px",
            background: "#1c5d45",
            color: "white",
            fontWeight: 800,
          }}
        >
          Create free workspace
        </button>
      </form>
    </main>
  );
}
