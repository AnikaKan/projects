import {
  approveExperiment,
  closeEnrollment,
  createExperiment,
  deliverTestAlert,
  deriveAnalysisSnapshot,
  deriveQualitySnapshot,
  disableExperiment,
  launchExperiment,
  invalidateAnalysis,
  recordDecision,
} from "@/app/actions";
import {
  type AnalysisSnapshotResponse,
  type DecisionResponse,
  localScopeConfiguration,
  readApiHealth,
  readAuditRecords,
  readExperimentAnalyses,
  readExperimentDecisions,
  readExperimentQualities,
  readExperiments,
  readOperationalStatus,
} from "@/lib/api";

export default async function Home() {
  const [health, experiments] = await Promise.all([
    readApiHealth(),
    readExperiments(),
  ]);
  const [qualities, analyses, decisions, auditRecords, operationalStatus] =
    await Promise.all([
      readExperimentQualities(experiments),
      readExperimentAnalyses(experiments),
      readExperimentDecisions(experiments),
      readAuditRecords(),
      readOperationalStatus(),
    ]);
  const scope = localScopeConfiguration();
  return (
    <main id="main-content">
      <a className="skip-link" href="#experiments">
        Skip to experiments
      </a>
      <header className="hero">
        <div>
          <p className="eyebrow">ExperimentOS · Local laboratory</p>
          <h1>Launch a trustworthy product experiment.</h1>
          <p className="lede">
            Define the hypothesis before launch, freeze the approved plan, and
            assign each eligible person consistently.
          </p>
        </div>
        <div
          className={`connection ${health ? "healthy" : "unavailable"}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-dot" />
          {health ? "Local API connected" : "Local API unavailable"}
        </div>
      </header>
      <div className="workspace">
        <section className="setup-panel">
          <p className="step">Step 1</p>
          <h2>Design the experiment</h2>
          <p className="muted">
            This creates a draft. Approval and launch are separate, auditable
            decisions.
          </p>
          {!scope ? (
            <p className="notice">Local scope variables are not configured.</p>
          ) : (
            <form action={createExperiment}>
              <label>
                Experiment key
                <input name="key" placeholder="signup-message" required />
              </label>
              <label>
                Display name
                <input name="name" placeholder="Signup message test" required />
              </label>
              <label>
                Hypothesis
                <textarea
                  name="hypothesis"
                  placeholder="A clearer message will increase completed signups."
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Traffic percentage
                  <input
                    name="traffic_percent"
                    type="number"
                    defaultValue="100"
                    min="0"
                    max="100"
                    required
                  />
                </label>
                <label>
                  Eligible markets
                  <input
                    name="eligibility_values"
                    placeholder="US, CA (optional)"
                  />
                </label>
              </div>
              <button type="submit">Create draft</button>
            </form>
          )}
        </section>
        <section
          className="list-panel"
          id="experiments"
          aria-labelledby="experiments-title"
        >
          <div className="section-heading">
            <div>
              <p className="step">Step 2</p>
              <h2 id="experiments-title">Review and operate</h2>
            </div>
            <span className="count">{experiments.length} experiments</span>
          </div>
          {experiments.length === 0 ? (
            <div className="empty-state">
              <span>01</span>
              <h3>No experiments yet</h3>
              <p>Create a draft to begin the local workflow.</p>
            </div>
          ) : (
            <div className="experiment-list">
              {experiments.map((experiment) => (
                <article className="experiment-card" key={experiment.id}>
                  <div className="card-heading">
                    <div>
                      <span className={`badge badge-${experiment.status}`}>
                        {experiment.status.replaceAll("_", " ")}
                      </span>
                      <h3>{experiment.name}</h3>
                      <code>{experiment.key}</code>
                    </div>
                    <strong>v{experiment.version}</strong>
                  </div>
                  <p>{experiment.analysis_plan.hypothesis}</p>
                  <dl>
                    <div>
                      <dt>Traffic</dt>
                      <dd>
                        {experiment.configuration
                          .traffic_allocation_basis_points / 100}
                        %
                      </dd>
                    </div>
                    <div>
                      <dt>Split</dt>
                      <dd>50 / 50</dd>
                    </div>
                    <div>
                      <dt>Primary metric</dt>
                      <dd>{experiment.analysis_plan.primary_metric.key}</dd>
                    </div>
                  </dl>
                  <p className="digest">
                    Frozen document fingerprint:{" "}
                    {experiment.configuration_digest.slice(0, 12)}…
                  </p>
                  {qualities[experiment.id] ? (
                    <div className="quality-panel">
                      <div className="quality-heading">
                        <strong>Pipeline quality</strong>
                        <span
                          className={`quality-state ${
                            qualities[experiment.id]?.finalization_ready
                              ? "quality-ready"
                              : "quality-blocked"
                          }`}
                        >
                          {qualities[experiment.id]?.finalization_ready
                            ? "Ready for analysis"
                            : "Not ready"}
                        </span>
                      </div>
                      <div className="quality-counts">
                        <div>
                          <span>Assigned</span>
                          <strong>
                            {qualities[experiment.id]?.source_counts
                              .cohort_assignments ?? 0}
                          </strong>
                        </div>
                        <div>
                          <span>Control</span>
                          <strong>
                            {qualities[experiment.id]?.arm_counts.control
                              ?.assigned ?? 0}
                          </strong>
                        </div>
                        <div>
                          <span>Treatment</span>
                          <strong>
                            {qualities[experiment.id]?.arm_counts.treatment
                              ?.assigned ?? 0}
                          </strong>
                        </div>
                        <div>
                          <span>Excluded events</span>
                          <strong>
                            {qualities[experiment.id]?.source_counts
                              .excluded_events ?? 0}
                          </strong>
                        </div>
                      </div>
                      <ul className="readiness-list">
                        {Object.entries(
                          qualities[experiment.id]?.readiness ?? {},
                        ).map(([key, passed]) => (
                          <li
                            key={key}
                            className={passed ? "passed" : "waiting"}
                          >
                            <span aria-hidden="true">{passed ? "✓" : "○"}</span>
                            {key.replaceAll("_", " ")}
                          </li>
                        ))}
                      </ul>
                      <p className="quality-version">
                        Snapshot {qualities[experiment.id]?.derivation_version}
                      </p>
                    </div>
                  ) : (
                    <div className="quality-panel quality-empty">
                      <strong>Pipeline quality not evaluated yet</strong>
                      <p>
                        Derive a snapshot to see real cohort counts and every
                        remaining readiness gate.
                      </p>
                    </div>
                  )}
                  <ExperimentEvidence
                    analysis={analyses[experiment.id]}
                    decisions={decisions[experiment.id] ?? []}
                    experimentId={experiment.id}
                    qualityReady={
                      qualities[experiment.id]?.finalization_ready === true
                    }
                  />
                  <div className="actions">
                    {experiment.status === "draft" && (
                      <form action={approveExperiment}>
                        <Fields
                          id={experiment.id}
                          version={experiment.version}
                        />
                        <button type="submit">Approve plan</button>
                      </form>
                    )}
                    {experiment.status === "approved" && (
                      <form action={launchExperiment}>
                        <Fields
                          id={experiment.id}
                          version={experiment.version}
                        />
                        <button type="submit">Launch</button>
                      </form>
                    )}
                    {experiment.status === "running" && (
                      <form action={closeEnrollment}>
                        <Fields
                          id={experiment.id}
                          version={experiment.version}
                        />
                        <button type="submit" className="secondary">
                          Close enrollment
                        </button>
                      </form>
                    )}
                    {(experiment.status === "running" ||
                      experiment.status === "enrollment_closed") && (
                      <form action={disableExperiment}>
                        <Fields
                          id={experiment.id}
                          version={experiment.version}
                        />
                        <button type="submit" className="danger">
                          Emergency disable
                        </button>
                      </form>
                    )}
                    {qualities[experiment.id]?.finalization_ready &&
                      !analyses[experiment.id] && (
                        <form action={deriveAnalysisSnapshot}>
                          <input
                            type="hidden"
                            name="experiment_id"
                            value={experiment.id}
                          />
                          <input
                            type="hidden"
                            name="cohort_snapshot_id"
                            value={qualities[experiment.id]?.id}
                          />
                          <button type="submit">Run frozen analysis</button>
                        </form>
                      )}
                    {(experiment.status === "running" ||
                      experiment.status === "enrollment_closed" ||
                      experiment.status === "stopped") && (
                      <form action={deriveQualitySnapshot}>
                        <input
                          type="hidden"
                          name="experiment_id"
                          value={experiment.id}
                        />
                        <button type="submit" className="secondary">
                          Refresh pipeline quality
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <OperationsPanel status={operationalStatus} />
      <section className="audit-panel" aria-labelledby="audit-title">
        <div className="section-heading">
          <div>
            <p className="step">Step 4</p>
            <h2 id="audit-title">Audit trail</h2>
          </div>
          <span className="count">
            Latest {Math.min(auditRecords.length, 12)} records
          </span>
        </div>
        {auditRecords.length === 0 ? (
          <p className="muted">
            No scoped operator actions have been recorded yet.
          </p>
        ) : (
          <ol className="audit-list">
            {auditRecords.slice(0, 12).map((record) => (
              <li key={record.id}>
                <div>
                  <strong>{record.action.replaceAll("_", " ")}</strong>
                  <span>{record.actor_id}</span>
                </div>
                <time dateTime={record.occurred_at}>
                  {new Date(record.occurred_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Los_Angeles",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentage(value: unknown): string {
  const amount = numeric(value);
  return amount === null ? "Unavailable" : `${(amount * 100).toFixed(2)}%`;
}

function points(value: unknown): string {
  const amount = numeric(value);
  return amount === null ? "Unavailable" : `${amount.toFixed(2)} points`;
}

function AnalysisPanel({
  analysis,
  decisions,
  experimentId,
}: {
  analysis: AnalysisSnapshotResponse;
  decisions: DecisionResponse[];
  experimentId: string;
}) {
  const results = record(analysis.results);
  const primary = record(results.primary);
  const interval = record(primary.confidence_interval);
  const guardrail = record(results.guardrail);
  const decision = decisions[0];
  const invalidated = analysis.invalidated_at !== null;
  return (
    <div className="analysis-panel">
      <div className="quality-heading">
        <strong>Finalized evidence</strong>
        <span
          className={`quality-state ${invalidated ? "quality-invalid" : "quality-ready"}`}
        >
          {invalidated ? "Invalidated" : "Valid and immutable"}
        </span>
      </div>
      <p className="evidence-order">
        Data-quality gates passed before these effects were calculated.
      </p>
      <div className="result-grid">
        <div>
          <span>Control rate</span>
          <strong>{percentage(primary.control_rate)}</strong>
        </div>
        <div>
          <span>Treatment rate</span>
          <strong>{percentage(primary.treatment_rate)}</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>
            {points(primary.absolute_difference_percentage_points)}
          </strong>
        </div>
        <div>
          <span>95% confidence interval</span>
          <strong>
            {points(interval.low_percentage_points)} to{" "}
            {points(interval.high_percentage_points)}
          </strong>
        </div>
      </div>
      <div className="recommendation-block">
        <span>Statistical recommendation</span>
        <strong>{analysis.recommendation.replaceAll("_", " ")}</strong>
        <p>
          Guardrail safety:{" "}
          {guardrail.acceptable === true ? "demonstrated" : "not demonstrated"}.
          This recommendation cannot deploy a product change.
        </p>
      </div>
      {decision ? (
        <div className="decision-record" role="status">
          <strong>
            Human decision: {decision.action.replaceAll("_", " ")}
          </strong>
          <p>{decision.rationale}</p>
          <span>Recorded by {decision.actor_subject}</span>
        </div>
      ) : invalidated ? (
        <p className="notice" role="alert">
          This evidence was invalidated and cannot receive a launch decision.
        </p>
      ) : (
        <form action={recordDecision} className="decision-form">
          <input type="hidden" name="experiment_id" value={experimentId} />
          <input type="hidden" name="snapshot_id" value={analysis.id} />
          <label>
            Human decision
            <select
              name="decision_action"
              defaultValue="request_new_experiment"
            >
              <option value="approve_launch">Approve external rollout</option>
              <option value="reject_launch">Do not launch</option>
              <option value="request_new_experiment">
                Request a new experiment
              </option>
            </select>
          </label>
          <label>
            Rationale
            <textarea
              name="rationale"
              minLength={10}
              required
              aria-describedby={`decision-help-${analysis.id}`}
            />
            <span className="field-help" id={`decision-help-${analysis.id}`}>
              Explain the human judgment; the statistical result alone is not
              authorization.
            </span>
          </label>
          <label>
            External rollout reference
            <input
              name="rollout_reference"
              placeholder="Required when approving rollout"
            />
          </label>
          <button type="submit">Record immutable decision</button>
        </form>
      )}
      {!invalidated && (
        <details className="invalidate-control">
          <summary>Invalidate this evidence</summary>
          <form action={invalidateAnalysis}>
            <input type="hidden" name="experiment_id" value={experimentId} />
            <input type="hidden" name="snapshot_id" value={analysis.id} />
            <label>
              Reason for invalidation
              <textarea name="invalidation_reason" minLength={10} required />
            </label>
            <button type="submit" className="danger">
              Invalidate snapshot
            </button>
          </form>
        </details>
      )}
      <p className="quality-version">
        Analysis {analysis.analysis_version} · cohort{" "}
        {analysis.derivation_version}
      </p>
    </div>
  );
}

function ExperimentEvidence({
  analysis,
  decisions,
  experimentId,
  qualityReady,
}: {
  analysis: AnalysisSnapshotResponse | null | undefined;
  decisions: DecisionResponse[];
  experimentId: string;
  qualityReady: boolean;
}) {
  if (analysis) {
    return (
      <AnalysisPanel
        analysis={analysis}
        decisions={decisions}
        experimentId={experimentId}
      />
    );
  }
  if (!qualityReady) return null;
  return (
    <div className="quality-panel quality-empty">
      <strong>Mature evidence is ready to analyze</strong>
      <p>
        The analysis uses the frozen plan and cannot change the product
        automatically.
      </p>
    </div>
  );
}

function OperationsPanel({
  status,
}: {
  status: Awaited<ReturnType<typeof readOperationalStatus>>;
}) {
  if (!status) {
    return (
      <section className="operations-panel" aria-labelledby="operations-title">
        <p className="step">Step 3</p>
        <h2 id="operations-title">Local operations</h2>
        <p className="notice" role="alert">
          Operational evidence is temporarily unavailable. No success state is
          being inferred.
        </p>
      </section>
    );
  }
  const requestMetrics = record(status.request_metrics);
  const latency = record(requestMetrics.latency_milliseconds);
  const database = record(status.database_pool);
  const pipeline = record(status.event_pipeline);
  const completeness = record(status.completeness);
  const overrides = record(status.override_state);
  return (
    <section className="operations-panel" aria-labelledby="operations-title">
      <div className="section-heading">
        <div>
          <p className="step">Step 3</p>
          <h2 id="operations-title">Local operations</h2>
        </div>
        <span className="quality-state quality-ready">Observed locally</span>
      </div>
      <p className="muted">{status.evidence_scope}</p>
      <div className="operations-grid">
        <Metric
          label="API requests"
          value={String(requestMetrics.request_count ?? 0)}
        />
        <Metric label="API p95" value={`${String(latency.p95 ?? "—")} ms`} />
        <Metric
          label="API errors"
          value={String(requestMetrics.error_count ?? 0)}
        />
        <Metric
          label="Overload rejections"
          value={String(requestMetrics.overload_rejections ?? 0)}
        />
        <Metric
          label="DB connections in use"
          value={String(database.checked_out ?? "—")}
        />
        <Metric
          label="Queue pending"
          value={String(pipeline.pending_messages ?? "—")}
        />
        <Metric
          label="Queue age observed"
          value={`${String(pipeline.max_observed_delivery_queue_age_seconds ?? "—")} s`}
        />
        <Metric
          label="Processing freshness"
          value={`${String(pipeline.max_observed_processing_freshness_seconds ?? "—")} s`}
        />
        <Metric
          label="Quarantine"
          value={String(pipeline.quarantined_events ?? 0)}
        />
        <Metric
          label="Incomplete partitions"
          value={String(completeness.incomplete_checkpoints ?? 0)}
        />
        <Metric
          label="Emergency overrides"
          value={String(overrides.emergency_stopped_experiments ?? 0)}
        />
        <Metric
          label="Dead letters"
          value={String(pipeline.dead_letter_messages ?? 0)}
        />
      </div>
      <form action={deliverTestAlert} className="alert-test-form">
        <label>
          Local test recipient label
          <input
            name="recipient_label"
            defaultValue="synthetic-local-operator"
            minLength={3}
            required
            aria-describedby="alert-test-help"
          />
          <span className="field-help" id="alert-test-help">
            This proves the local alert workflow only. It does not contact a
            real person.
          </span>
        </label>
        <button type="submit" className="secondary">
          Deliver local test alert
        </button>
      </form>
      {status.alerts.length > 0 && (
        <p className="local-alert-receipt" role="status">
          Latest alert: {status.alerts[0]?.delivery_status.replaceAll("_", " ")}{" "}
          to {status.alerts[0]?.recipient_label}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fields({ id, version }: { id: string; version: number }) {
  return (
    <>
      <input type="hidden" name="experiment_id" value={id} />
      <input type="hidden" name="expected_version" value={version} />
    </>
  );
}
