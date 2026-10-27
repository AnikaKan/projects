export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <div className="loading-state">
        <p className="eyebrow">ExperimentOS</p>
        <h1>Loading the local evidence…</h1>
        <p>Checking experiments, data quality, analysis, and operations.</p>
      </div>
    </main>
  );
}
