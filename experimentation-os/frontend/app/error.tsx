"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <div className="error-state" role="alert">
        <p className="eyebrow">ExperimentOS · Local laboratory</p>
        <h1>We could not load this evidence.</h1>
        <p>
          No experiment decision was changed. Check that the local API and
          Docker are running, then try again.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
