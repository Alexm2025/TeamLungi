import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Spinner } from "../../components/ui";
import { useWallet } from "../dashboard/WalletContext";
import { BUCKETS, EXPIRING_DAYS, loadManufacturerBatches, toCsv } from "./loadBatches";
import "./batches.css";

const TONE = {
  with_you: "teal",
  in_transit: "amber",
  awaiting: "violet",
  at_distributor: "blue",
  at_pharmacy: "green",
  recalled: "red",
  expired: "grey",
};

const SORTS = {
  newest: ["Newest first", (a, b) => b.createdAt - a.createdAt],
  oldest: ["Oldest first", (a, b) => a.createdAt - b.createdAt],
  expiry: ["Expiry: soonest", (a, b) => a.expiry - b.expiry],
  quantity: ["Quantity: largest", (a, b) => b.quantity - a.quantity],
};

const fmtDate = (s) => new Date(s * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Progress({ r }) {
  const step = (label, done, active) => (
    <span className={`mb-step${done ? " done" : ""}${active ? " active" : ""}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
  const toDist = r.pendingTo && !r.stages.distributor;
  const toPharm = r.pendingTo && r.stages.distributor && !r.stages.pharmacy;
  return (
    <div className="mb-progress" aria-label="Supply-chain progress">
      {step("Made", true, false)}
      {step("Distributor", r.stages.distributor, toDist)}
      {step("Pharmacy", r.stages.pharmacy, toPharm)}
    </div>
  );
}

export default function MyBatchesPage() {
  const { signedIn, sessionRole, account, participant } = useWallet();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const q = params.get("q") ?? "";
  const bucket = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "newest";
  const set = (key, value, fallback) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const isManufacturer = signedIn && sessionRole === "manufacturer";
  const load = useCallback(async () => {
    if (!isManufacturer) return;
    setLoading(true);
    setError("");
    try {
      setRows(await loadManufacturerBatches(account));
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  }, [isManufacturer, account]);

  useEffect(() => {
    load();
    window.addEventListener("medichain:changed", load);
    return () => window.removeEventListener("medichain:changed", load);
  }, [load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(Object.keys(BUCKETS).map((k) => [k, 0]));
    for (const r of rows ?? []) {
      c.all += 1;
      c[r.bucket] += 1;
    }
    c.units = (rows ?? []).reduce((s, r) => s + r.quantity, 0);
    c.expiring = (rows ?? []).filter((r) => r.bucket !== "recalled" && r.daysToExpiry >= 0 && r.daysToExpiry <= EXPIRING_DAYS).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => bucket === "all" || r.bucket === bucket || (bucket === "expiring" && r.bucket !== "recalled" && r.daysToExpiry >= 0 && r.daysToExpiry <= EXPIRING_DAYS))
      .filter((r) => !needle || r.batchId.toLowerCase().includes(needle) || r.drugName.toLowerCase().includes(needle) || r.holder.toLowerCase().includes(needle))
      .sort(SORTS[sort]?.[1] ?? SORTS.newest[1]);
  }, [rows, q, bucket, sort]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(visible)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `medichain-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!isManufacturer) {
    return (
      <section className="panel center">
        <h1>My batches</h1>
        <p className="muted">This page lists every batch a manufacturer has created. Sign in as Manufacturer to see yours.</p>
        <Link to="/" className="btn btn-primary">Go to sign in</Link>
      </section>
    );
  }

  const OVERVIEW = [
    ["all", "Total batches", counts.all],
    ["with_you", "With you", counts.with_you],
    ["in_transit", "In transit", counts.in_transit],
    ["awaiting", "Awaiting approval", counts.awaiting],
    ["at_distributor", "At distributors", counts.at_distributor],
    ["at_pharmacy", "At pharmacies", counts.at_pharmacy],
    ["recalled", "Recalled", counts.recalled],
    ["expiring", `Expiring ≤ ${EXPIRING_DAYS} days`, counts.expiring],
  ];

  return (
    <div className="mb">
      <header className="mb-head">
        <div>
          <p className="mb-kicker">Manufacturer</p>
          <h1>My batches</h1>
          <p className="muted">
            Every batch {participant.name || "you"} registered on-chain, with where it is now. {rows && `${counts.units.toLocaleString()} units in total.`}
          </p>
        </div>
        <div className="mb-head-actions">
          <Button variant="secondary" onClick={load} loading={loading}>Refresh</Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>Export CSV</Button>
          <Link to="/dashboard" className="btn btn-primary">New batch</Link>
        </div>
      </header>

      {error && <Alert type="error" title="Couldn't load your batches">{error}</Alert>}

      <section className="mb-overview" aria-label="Overview">
        {OVERVIEW.map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            className={`mb-stat mb-${TONE[key] ?? "ink"}${bucket === key ? " is-on" : ""}`}
            onClick={() => set("status", key, "all")}
            aria-pressed={bucket === key}
          >
            <strong>{rows ? value : "—"}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>

      <section className="mb-tools">
        <div className="mb-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => set("q", e.target.value, "")} placeholder="Search by batch ID, drug or holder" aria-label="Search batches" />
          {q && <button type="button" onClick={() => set("q", "", "")} aria-label="Clear search">✕</button>}
        </div>
        <select value={bucket} onChange={(e) => set("status", e.target.value, "all")} aria-label="Filter by status">
          {Object.entries(BUCKETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="expiring">{`Expiring ≤ ${EXPIRING_DAYS} days`}</option>
        </select>
        <select value={sort} onChange={(e) => set("sort", e.target.value, "newest")} aria-label="Sort">
          {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </section>

      {rows === null ? (
        <Spinner label="Reading your batches from the blockchain…" />
      ) : visible.length === 0 ? (
        <div className="mb-empty">
          {rows.length === 0 ? (
            <>
              <strong>No batches yet</strong>
              <p className="muted">Create your first batch from the dashboard, or ask the assistant to do it.</p>
              <Link to="/dashboard" className="btn btn-primary">Create a batch</Link>
            </>
          ) : (
            <>
              <strong>No batches match</strong>
              <p className="muted">Try a different search or filter.</p>
              <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mb-count">{visible.length === rows.length ? `${rows.length} batches` : `${visible.length} of ${rows.length} batches`}</p>
          <ul className="mb-list">
            {visible.map((r) => (
              <li key={r.batchId}>
                <button type="button" className="mb-row" onClick={() => navigate(`/verify/${encodeURIComponent(r.batchId)}`)}>
                  <div className="mb-id">
                    <strong className="mono">{r.batchId}</strong>
                    <span>{r.drugName}</span>
                  </div>
                  <div className="mb-qty">
                    <strong>{r.quantity.toLocaleString()}</strong>
                    <span>units</span>
                  </div>
                  <div className="mb-where">
                    <span className={`mb-badge mb-${TONE[r.bucket]}`}>{BUCKETS[r.bucket]}</span>
                    <span className="mb-holder">
                      {r.pendingTo ? `${r.holder} → ${r.pendingTo}` : r.bucket === "with_you" ? "In your warehouse" : `Held by ${r.holder}`}
                    </span>
                  </div>
                  <Progress r={r} />
                  <div className="mb-dates">
                    <span>Made {fmtDate(r.mfgDate)}</span>
                    <span className={r.daysToExpiry < 0 ? "bad" : r.daysToExpiry <= EXPIRING_DAYS ? "warn" : ""}>
                      {r.daysToExpiry < 0 ? `Expired ${fmtDate(r.expiry)}` : `Expires ${fmtDate(r.expiry)}`}
                    </span>
                  </div>
                  <div className="mb-report" title={r.hasReport ? r.docHash : "No lab report fingerprint registered"}>
                    {r.hasReport ? "Lab report ✓" : "No lab report"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
