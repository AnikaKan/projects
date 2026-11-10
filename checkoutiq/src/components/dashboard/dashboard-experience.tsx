"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ActivityIcon, AlertIcon, CheckIcon, ClockIcon, RefreshIcon, ShieldIcon } from "@/components/icons";
import { calculateDashboardAnalytics, type DashboardTransaction } from "@/lib/dashboard/analytics";
import type { PaymentStatus } from "@/lib/payment/types";

type DashboardPayload = ReturnType<typeof calculateDashboardAnalytics> & {
  generatedAt: string;
  transactions: DashboardTransaction[];
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const statusOptions: Array<"ALL" | PaymentStatus> = ["ALL", "SUCCEEDED", "FAILED", "UNKNOWN", "PROCESSING"];

function formatLatency(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)}s` : `${value}ms`;
}

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function DashboardExperience() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | PaymentStatus>("ALL");
  const [errorFilter, setErrorFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(regenerate = false) {
    setError(null);
    if (regenerate) setSeeding(true);
    else setLoading(true);
    try {
      let response = await fetch("/api/dashboard", { method: regenerate ? "POST" : "GET", cache: "no-store" });
      let next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "Could not load payment operations data.");
      if (!regenerate && next.transactions.length < 12) {
        response = await fetch("/api/dashboard", { method: "POST" });
        next = await response.json();
        if (!response.ok) throw new Error(next.error ?? "Could not generate demonstration history.");
      }
      setPayload(next);
      setSelectedId((current) => current && next.transactions.some((item: DashboardTransaction) => item.id === current) ? current : next.transactions[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dashboard unavailable.");
    } finally {
      setLoading(false);
      setSeeding(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const errorOptions = useMemo(() => {
    if (!payload) return [];
    return [...new Set(payload.transactions.map((item) => item.errorCategory).filter((value): value is string => Boolean(value)))].sort();
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const normalized = query.trim().toLowerCase();
    return payload.transactions.filter((item) =>
      (statusFilter === "ALL" || item.status === statusFilter) &&
      (errorFilter === "ALL" || item.errorCategory === errorFilter) &&
      (!normalized || item.orderNumber.toLowerCase().includes(normalized) || item.errorCode?.toLowerCase().includes(normalized)),
    );
  }, [payload, statusFilter, errorFilter, query]);

  const analytics = useMemo(() => calculateDashboardAnalytics(filtered), [filtered]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const metrics = analytics.metrics;
  const hasLatency = filtered.some((item) => item.latencyMs !== null);

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <a className="brand" href="/"><span className="brand-mark"><ActivityIcon /></span><span>CheckoutIQ</span></a>
        <nav className="ops-nav" aria-label="Product navigation"><a href="/">Checkout</a><a href="/simulator">Simulator</a><a className="active" href="/dashboard">Reliability dashboard</a></nav>
        <div className="ops-env"><span className="env-dot" />Simulation data <span>{payload?.transactions.length ?? 0} transactions</span></div>
      </header>

      <section className="ops-heading">
        <div><p className="eyebrow">Payment operations · reliability command center</p><h1>Know which payments <br />need attention now.</h1></div>
        <div className="ops-heading-actions"><p>Every metric below is calculated from persisted simulated transaction data—never hard-coded presentation values.</p><button onClick={() => void load(true)} disabled={seeding}><RefreshIcon />{seeding ? "Regenerating…" : "Regenerate demo history"}</button></div>
      </section>

      <section className="filter-bar" aria-label="Transaction filters">
        <div className="state-filters">{statusOptions.map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status === "ALL" ? "All states" : statusLabel(status)}</button>)}</div>
        <label><span>Error type</span><select value={errorFilter} onChange={(event) => setErrorFilter(event.target.value)}><option value="ALL">All categories</option>{errorOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="search-field"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order or error code" /></label>
        <span className="filter-count">{filtered.length} shown</span>
      </section>

      {error && <div className="dashboard-error"><AlertIcon />{error}<button onClick={() => void load()}>Retry</button></div>}
      {loading ? <div className="dashboard-loading"><span className="spinner dark" /><p>Calculating reliability metrics from transaction history…</p></div> : payload && <>
        <section className="metric-grid">
          <article className="metric-card primary"><div><span>Success rate</span><ShieldIcon /></div><strong>{metrics.successRate.toFixed(1)}%</strong><p>{metrics.succeeded} of {metrics.total} filtered payments confirmed</p><i style={{ width: `${metrics.successRate}%` }} /></article>
          <article className="metric-card"><div><span>Failed</span><AlertIcon /></div><strong>{metrics.failed}</strong><p>Definitive failures · controlled retry eligible</p></article>
          <article className="metric-card attention"><div><span>Unknown</span><ClockIcon /></div><strong>{metrics.unknown}</strong><p>{metrics.pendingReconciliation} require reconciliation</p></article>
          <article className="metric-card"><div><span>Average latency</span><ActivityIcon /></div><strong>{hasLatency ? formatLatency(metrics.averageLatencyMs) : "—"}</strong><p>P95 {hasLatency ? formatLatency(metrics.p95LatencyMs) : "—"}</p></article>
          <article className="metric-card protected"><div><span>Duplicates handled</span><ShieldIcon /></div><strong>{metrics.duplicateRequestsHandled}</strong><p>Replacement charges safely prevented</p></article>
        </section>

        <section className="chart-grid">
          <article className="chart-card trend-card"><div className="card-heading"><div><p className="section-kicker">Reliability over time</p><h2>Success rate and volume</h2></div><div className="chart-legend"><span><i className="legend-line" />Success rate</span><span><i className="legend-area" />Volume</span></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={analytics.reliabilityTrend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a7c5b2" stopOpacity={0.55}/><stop offset="100%" stopColor="#a7c5b2" stopOpacity={0.05}/></linearGradient></defs><CartesianGrid stroke="#e8ebe8" vertical={false}/><XAxis dataKey="label" tick={{ fill: "#7b837e", fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis yAxisId="rate" domain={[0, 100]} tick={{ fill: "#7b837e", fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis yAxisId="volume" orientation="right" allowDecimals={false} tick={{ fill: "#7b837e", fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ border: "1px solid #dce2dd", borderRadius: 10, fontSize: 11 }} /><Area yAxisId="volume" dataKey="volume" type="monotone" fill="url(#volumeFill)" stroke="#9db9a7" strokeWidth={1.5}/><Line yAxisId="rate" dataKey="successRate" type="monotone" stroke="#255f43" strokeWidth={2.5} dot={{ fill: "#fff", stroke: "#255f43", r: 3 }} unit="%"/></ComposedChart></ResponsiveContainer></div></article>

          <article className="chart-card error-chart"><div className="card-heading"><div><p className="section-kicker">Failure mix</p><h2>Error categories</h2></div><span>{analytics.errorCategories.reduce((sum, item) => sum + item.count, 0)} affected</span></div>{analytics.errorCategories.length ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analytics.errorCategories} dataKey="count" nameKey="category" innerRadius={52} outerRadius={76} paddingAngle={3}>{analytics.errorCategories.map((item) => <Cell key={item.category} fill={item.color} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #dce2dd", borderRadius: 10, fontSize: 11 }} /></PieChart></ResponsiveContainer><div><strong>{analytics.errorCategories.reduce((sum, item) => sum + item.count, 0)}</strong><span>errors</span></div></div><div className="error-legend">{analytics.errorCategories.map((item) => <button key={item.category} onClick={() => setErrorFilter(item.category)}><i style={{ background: item.color }} /><span>{item.category.replaceAll("_", " ")}</span><strong>{item.count}</strong></button>)}</div></> : <div className="no-chart"><CheckIcon />No errors in this view</div>}</article>

          <article className="chart-card latency-card"><div className="card-heading"><div><p className="section-kicker">Processor performance</p><h2>Payment latency distribution</h2></div><span>P95 · {hasLatency ? formatLatency(metrics.p95LatencyMs) : "—"}</span></div><div className="chart-wrap compact"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.latencyDistribution} margin={{ top: 10, right: 5, left: -28, bottom: 0 }}><CartesianGrid stroke="#e8ebe8" vertical={false}/><XAxis dataKey="label" tick={{ fill: "#7b837e", fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "#7b837e", fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ border: "1px solid #dce2dd", borderRadius: 10, fontSize: 11 }} /><Bar dataKey="count" fill="#526e61" radius={[5,5,0,0]} maxBarSize={44}/></BarChart></ResponsiveContainer></div></article>
        </section>

        <section className="operations-grid">
          <article className="transaction-card"><div className="card-heading"><div><p className="section-kicker">Payment operations</p><h2>Transaction queue</h2></div><span>Newest first</span></div><div className="transaction-table" role="table"><div className="transaction-row table-head" role="row"><span>Order</span><span>State</span><span>Error</span><span>Latency</span><span>Amount</span></div>{filtered.map((transaction) => <button key={transaction.id} className={`transaction-row ${selected?.id === transaction.id ? "selected" : ""}`} onClick={() => setSelectedId(transaction.id)} role="row"><span><strong>{transaction.orderNumber}</strong><small>{new Date(transaction.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span><span><i className={`status-dot ${transaction.status.toLowerCase()}`} />{statusLabel(transaction.status)}</span><span>{transaction.errorCategory?.replaceAll("_", " ") ?? "—"}</span><span>{transaction.latencyMs === null ? "Pending" : formatLatency(transaction.latencyMs)}</span><span>{money(transaction.amountCents)}</span></button>)}{!filtered.length && <div className="empty-table"><ActivityIcon /><p>No transactions match these filters.</p><button onClick={() => { setStatusFilter("ALL"); setErrorFilter("ALL"); setQuery(""); }}>Clear filters</button></div>}</div></article>

          <aside className="detail-card">{selected ? <><div className="detail-heading"><div><p className="section-kicker">Transaction detail</p><h2>{selected.orderNumber}</h2></div><span className={`detail-status ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span></div><div className="detail-summary"><div><span>Amount</span><strong>{money(selected.amountCents)}</strong></div><div><span>Latency</span><strong>{selected.latencyMs === null ? "Pending" : formatLatency(selected.latencyMs)}</strong></div><div><span>Charge count</span><strong>{selected.simulatedChargeCount}</strong></div><div><span>Duplicates</span><strong>{selected.duplicateRequestsHandled}</strong></div></div>{selected.status !== "SUCCEEDED" && <div className="incident-brief"><AlertIcon /><div><strong>{selected.errorCode ?? "PAYMENT_UNRESOLVED"}</strong><p>{selected.explanation}</p></div></div>}<div className="next-action"><ShieldIcon /><div><span>Recommended next action</span><p>{selected.recommendedAction}</p></div></div><div className="detail-events"><div><span>Event history</span><strong>{selected.events.length} events</strong></div>{selected.events.map((event, index) => <div className="detail-event" key={event.id}><div><span>{index + 1}</span><i /></div><section><strong>{event.type.replaceAll("_", " ")}</strong><p>{event.message}</p><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></section></div>)}</div></> : <div className="empty-detail"><ActivityIcon /><p>Select a transaction to inspect its payment history.</p></div>}</aside>
        </section>
      </>}
      <footer className="ops-footer"><span>CheckoutIQ · Simulated payment operations</span><span>Generated {payload ? new Date(payload.generatedAt).toLocaleString() : "—"}</span></footer>
    </main>
  );
}
