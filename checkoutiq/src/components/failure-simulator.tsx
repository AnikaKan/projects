"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ActivityIcon, AlertIcon, CheckIcon, ClockIcon, RefreshIcon, ShieldIcon } from "./icons";
import type { PaymentScenario, PaymentStatus } from "@/lib/payment/types";

type Phase = "idle" | "creating" | "processing" | "pending" | "reconciling" | "complete" | "error";
type Attempt = {
  id: string;
  scenario: PaymentScenario;
  status: PaymentStatus;
  processorOutcome: string | null;
  errorCode: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
};
type PaymentEvent = { id: string; type: string; message: string; createdAt: string };
type Order = {
  id: string;
  orderNumber: string;
  status: PaymentStatus;
  totalCents: number;
  simulatedChargeCount?: number;
  paymentAttempts?: Attempt[];
  events?: PaymentEvent[];
};

type ScenarioDefinition = {
  value: PaymentScenario;
  short: string;
  title: string;
  description: string;
  customer: string;
  classification: string;
  code: string;
  action: string;
  tone: "positive" | "negative" | "warning" | "neutral";
};

const scenarios: ScenarioDefinition[] = [
  {
    value: "SUCCESS",
    short: "Control",
    title: "Successful payment",
    description: "The processor accepts the simulated authorization and returns a definitive success response.",
    customer: "Payment confirmed. The order is complete.",
    classification: "No error",
    code: "PAYMENT_SUCCEEDED",
    action: "Fulfill the order. Block any later payment attempt for the same order.",
    tone: "positive",
  },
  {
    value: "HARD_DECLINE",
    short: "Issuer",
    title: "Bank hard decline",
    description: "The simulated issuer rejects the authorization with a definitive decline. No charge was created.",
    customer: "Payment declined. Ask the customer to use another payment method.",
    classification: "Issuer · hard decline",
    code: "BANK_HARD_DECLINE",
    action: "Do not retry automatically. Let the customer choose a different payment method.",
    tone: "negative",
  },
  {
    value: "MERCHANT_VALIDATION_FAILURE",
    short: "Integration",
    title: "Merchant validation failure",
    description: "Checkout cannot establish a valid simulated merchant session, so processing stops before authorization.",
    customer: "Payment is temporarily unavailable. No charge was attempted.",
    classification: "Merchant integration",
    code: "MERCHANT_VALIDATION_FAILED",
    action: "Inspect merchant configuration and validation logs, then retry only after remediation.",
    tone: "negative",
  },
  {
    value: "PROCESSOR_FAILURE",
    short: "Processor",
    title: "Payment processor failure",
    description: "The simulated processor is unavailable before it accepts the payment request.",
    customer: "Payment could not be processed. Try again in a moment.",
    classification: "Processor availability",
    code: "PROCESSOR_UNAVAILABLE",
    action: "Apply a bounded backoff. A new attempt is safe because acceptance never occurred.",
    tone: "negative",
  },
  {
    value: "CLIENT_TIMEOUT_BACKEND_SUCCESS",
    short: "Uncertain",
    title: "Client timeout, backend success",
    description: "The client loses the response after submission. The processor succeeds, but the merchant initially cannot prove the outcome.",
    customer: "Payment confirmation pending. Do not close or retry checkout.",
    classification: "Network · uncertain outcome",
    code: "CLIENT_TIMEOUT",
    action: "Keep the order in UNKNOWN, reconcile the original attempt, and never create a replacement charge first.",
    tone: "warning",
  },
  {
    value: "DUPLICATE_REQUEST",
    short: "Idempotency",
    title: "Duplicate payment request",
    description: "The client submits the same logical payment twice with one idempotency key.",
    customer: "Payment confirmed once. The duplicate request is invisible to the customer.",
    classification: "Duplicate · sequential",
    code: "DUPLICATE_REUSED",
    action: "Return the original operation and record that a duplicate charge was prevented.",
    tone: "neutral",
  },
  {
    value: "CONCURRENT_DUPLICATE_REQUESTS",
    short: "Concurrency",
    title: "Concurrent duplicate requests",
    description: "Three requests race with the same idempotency key. The server serializes them into one payment operation.",
    customer: "Payment confirmed once, even though multiple requests raced.",
    classification: "Duplicate · concurrent",
    code: "DUPLICATE_REUSED",
    action: "Reuse the winning operation. Monitor duplicate frequency for client-side retry defects.",
    tone: "neutral",
  },
];

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function actorFor(type: string) {
  if (type.startsWith("ORDER")) return "Merchant";
  if (type.startsWith("RECONCILIATION")) return "Recovery worker";
  if (type.includes("DUPLICATE")) return "Payment API";
  if (type.includes("OUTCOME_UNKNOWN")) return "Client + API";
  return "Payment backend";
}

export function FailureSimulator() {
  const [selected, setSelected] = useState<PaymentScenario>("HARD_DECLINE");
  const [phase, setPhase] = useState<Phase>("idle");
  const [order, setOrder] = useState<Order | null>(null);
  const [duplicates, setDuplicates] = useState(0);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runNumber, setRunNumber] = useState(0);
  const generation = useRef(0);
  const definition = scenarios.find((item) => item.value === selected)!;
  const attempt = order?.paymentAttempts?.[0];
  const running = ["creating", "processing", "pending", "reconciling"].includes(phase);

  async function loadOrder(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load the simulation.");
    return payload.order as Order;
  }

  async function run() {
    const token = ++generation.current;
    const nextRun = runNumber + 1;
    setRunNumber(nextRun);
    setOrder(null);
    setDuplicates(0);
    setDuplicateMessage(null);
    setError(null);
    setPhase("creating");

    try {
      const orderResponse = await fetch("/api/orders", { method: "POST" });
      const orderPayload = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderPayload.error ?? "Could not create the simulated order.");
      if (generation.current !== token) return;
      setOrder(orderPayload.order);
      setPhase("processing");
      await wait(450);

      const idempotencyKey = `demo-${selected.toLowerCase()}-${orderPayload.order.id}`;
      const paymentResponse = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: orderPayload.order.id, idempotencyKey, scenario: selected }),
      });
      const paymentPayload = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(paymentPayload.error ?? "The payment simulation failed.");
      if (generation.current !== token) return;
      setDuplicates(paymentPayload.result.duplicatesPrevented ?? 0);
      setDuplicateMessage(paymentPayload.result.message ?? null);
      const firstResult = await loadOrder(orderPayload.order.id);
      setOrder(firstResult);

      if (firstResult.status === "UNKNOWN") {
        setPhase("pending");
        const retryResponse = await fetch("/api/payments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: firstResult.id,
            idempotencyKey: `unsafe-retry-${firstResult.id}`,
            scenario: "SUCCESS",
          }),
        });
        const retryPayload = await retryResponse.json();
        if (!retryResponse.ok) throw new Error(retryPayload.error ?? "The protected retry failed.");
        setDuplicates((current) => current + (retryPayload.result.duplicatesPrevented ?? 0));
        setDuplicateMessage(retryPayload.result.message ?? null);
        setOrder(await loadOrder(firstResult.id));
        await wait(2600);
        if (generation.current !== token) return;
        setPhase("reconciling");
        const reconcileResponse = await fetch("/api/payments/reconcile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: firstResult.id }),
        });
        const reconcilePayload = await reconcileResponse.json();
        if (!reconcileResponse.ok) throw new Error(reconcilePayload.error ?? "Reconciliation failed.");
        await wait(650);
        if (generation.current !== token) return;
        setOrder(await loadOrder(firstResult.id));
      }
      if (generation.current === token) setPhase("complete");
    } catch (caught) {
      if (generation.current !== token) return;
      setError(caught instanceof Error ? caught.message : "The simulation failed.");
      setPhase("error");
    }
  }

  function reset() {
    generation.current += 1;
    setPhase("idle");
    setOrder(null);
    setDuplicates(0);
    setDuplicateMessage(null);
    setError(null);
  }

  const customerResult =
    phase === "pending" || phase === "reconciling"
      ? "Payment confirmation pending. We’re checking the original payment—do not retry."
      : order?.status === "SUCCEEDED" && selected === "CLIENT_TIMEOUT_BACKEND_SUCCESS"
        ? "Payment confirmed after reconciliation. Your order is complete."
        : definition.customer;
  const backendStatus =
    phase === "pending" || phase === "reconciling"
      ? "Processor: PROCESSING · Merchant record: UNKNOWN"
      : attempt
        ? `Processor: ${attempt.processorOutcome ?? attempt.status} · Attempt: ${attempt.status}`
        : "Not started";

  return (
    <main className="sim-shell">
      <header className="sim-topbar">
        <Link className="brand" href="/"><span className="brand-mark"><ActivityIcon /></span><span>CheckoutIQ</span></Link>
        <nav className="product-nav" aria-label="Product navigation"><Link href="/">Checkout</Link><Link className="active" href="/simulator">Failure simulator</Link><Link href="/dashboard">Operations</Link></nav>
        <span className="simulation-badge"><span /> Simulation only</span>
      </header>

      <section className="sim-heading">
        <div><p className="eyebrow">Payment operations · deterministic lab</p><h1>See every side of a<br />payment failure.</h1></div>
        <div className="sim-heading-copy"><p>Run a checkout and trace what the customer sees, what the merchant knows, and what actually happened in the backend.</p><div><span className="legend-dot customer" /> Customer <span className="legend-dot merchant" /> Merchant <span className="legend-dot backend" /> Backend</div></div>
      </section>

      <div className="sim-grid">
        <aside className="scenario-panel">
          <div className="panel-heading"><span>01</span><div><p className="section-kicker">Failure injection</p><h2>Choose a scenario</h2></div></div>
          <div className="scenario-menu" role="radiogroup" aria-label="Failure scenario">
            {scenarios.map((item) => (
              <button key={item.value} role="radio" aria-checked={selected === item.value} className={selected === item.value ? "scenario-option active" : "scenario-option"} onClick={() => { if (!running) { setSelected(item.value); reset(); } }} disabled={running}>
                <span className="scenario-index">{String(scenarios.indexOf(item) + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.short}</small></span><span className="choice-dot" />
              </button>
            ))}
          </div>
          <div className="scenario-actions"><button className="run-button" onClick={run} disabled={running}>{running ? <><span className="spinner" /> Running simulation…</> : <><ActivityIcon /> Run checkout</>}</button><button className="reset-button" onClick={reset} disabled={phase === "idle"}><RefreshIcon /> Reset</button></div>
        </aside>

        <section className="sim-stage">
          <div className={`scenario-brief ${definition.tone}`}><div className="brief-code">{definition.short}</div><div><p className="section-kicker">Selected scenario</p><h2>{definition.title}</h2><p>{definition.description}</p></div><code>{definition.code}</code></div>

          {phase === "idle" ? (
            <div className="empty-simulation"><div className="empty-orbit"><ActivityIcon /></div><h3>Ready to simulate</h3><p>Select a scenario, then run checkout to generate a new isolated order and deterministic payment trace.</p><div><ShieldIcon /> No real payment method or money is used.</div></div>
          ) : (
            <div className="simulation-results">
              <div className="run-status"><div><span className={`live-indicator ${phase}`} /><strong>{phase === "pending" ? "Waiting for confirmation" : phase === "reconciling" ? "Reconciling original attempt" : phase === "complete" ? "Simulation complete" : phase === "error" ? "Simulation interrupted" : "Running checkout"}</strong></div><div>{order?.orderNumber ?? "Creating order…"}{runNumber > 0 && <span>Run {String(runNumber).padStart(2, "0")}</span>}</div></div>
              {(phase === "pending" || phase === "reconciling") && <div className="pending-banner"><ClockIcon /><div><strong>Payment confirmation pending</strong><p>The client timed out. CheckoutIQ is holding the order in UNKNOWN and reconciling the original operation.</p></div><span className="pending-pulse" /></div>}
              {error && <div className="inline-error"><AlertIcon />{error}</div>}

              <div className="charge-proof"><strong className="charge-count-value">{order?.simulatedChargeCount ?? 0}</strong><div><span>Simulated charge count</span><b>{(order?.simulatedChargeCount ?? 0) === 1 ? "Exactly one confirmed simulated charge" : "No confirmed simulated charge"}</b></div>{duplicateMessage && <div className="duplicate-proof"><ShieldIcon /><strong>{duplicateMessage}</strong></div>}</div>

              <div className="perspective-grid">
                <article className="perspective customer-card"><div className="perspective-label"><span>C</span> Customer</div><h3>{phase === "creating" || phase === "processing" ? "Processing payment…" : customerResult}</h3><p>{phase === "pending" || phase === "reconciling" ? "The pay button stays locked while status is uncertain." : order?.status === "FAILED" ? "A confirmed failure can offer a safe retry path." : "The UI reflects only confirmed server state."}</p></article>
                <article className="perspective merchant-card"><div className="perspective-label"><span>M</span> Merchant</div><div className={`status-pill status-${order?.status?.toLowerCase() ?? "created"}`}>{order?.status ?? "CREATED"}</div><h3>{order?.status === "UNKNOWN" ? "Fulfillment is on hold" : order?.status === "FAILED" ? "No payment captured" : order?.status === "SUCCEEDED" ? "Order is safe to fulfill" : "Awaiting a definitive state"}</h3><p>{order ? `${money(order.totalCents)} simulated order` : "Creating a fresh order"}</p></article>
                <article className="perspective backend-card"><div className="perspective-label"><span>B</span> Backend</div><div className="backend-state"><span className={attempt?.processorOutcome === "SUCCEEDED" ? "green" : ""} />{backendStatus}</div><h3>{duplicates > 0 ? `${duplicates} duplicate charge${duplicates > 1 ? "s" : ""} prevented` : attempt?.errorCode ?? "Server-side state enforced"}</h3><p>Idempotency key and order state are checked before processor invocation.</p></article>
              </div>

              <div className="analysis-grid">
                <article className="classification-card"><p className="section-kicker">Error classification</p><div className="classification-title"><span className={`class-icon ${definition.tone}`}>{definition.tone === "positive" ? <CheckIcon /> : definition.tone === "warning" ? <ClockIcon /> : <AlertIcon />}</span><div><h3>{attempt?.errorCategory ?? definition.classification}</h3><code>{attempt?.errorCode ?? definition.code}</code></div></div><p>{attempt?.errorMessage ?? definition.description}</p></article>
                <article className="action-card"><p className="section-kicker">Recommended next action</p><div><ShieldIcon /><p>{definition.action}</p></div>{order?.status === "UNKNOWN" && <span>Retry blocked until reconciliation</span>}{order?.status === "SUCCEEDED" && <span>Additional charge blocked</span>}</article>
              </div>

              <article className="timeline-card"><div className="timeline-heading"><div><p className="section-kicker">Server event log</p><h3>Event-by-event timeline</h3></div><span>{order?.events?.length ?? 0} events</span></div><div className="timeline-list">{(order?.events ?? []).slice().reverse().map((event, index) => <div className="timeline-event" key={event.id}><div className="timeline-rail"><span>{index + 1}</span><i /></div><div className="timeline-content"><div><strong>{event.type.replaceAll("_", " ")}</strong><span>{actorFor(event.type)}</span></div><p>{event.message}</p><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div></div>)}{running && <div className="timeline-event active"><div className="timeline-rail"><span><span className="spinner dark" /></span></div><div className="timeline-content"><div><strong>{phase === "pending" ? "RECONCILIATION SCHEDULED" : phase.replaceAll("_", " ").toUpperCase()}</strong><span>Simulator</span></div><p>{phase === "pending" ? "Waiting before querying the original processor operation…" : "The deterministic scenario is progressing…"}</p></div></div>}</div></article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
