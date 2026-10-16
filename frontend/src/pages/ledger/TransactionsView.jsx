import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, Input, Select, Spinner, Table } from "../../components/ui";
import BatchLink from "../../components/ledger/BatchLink.jsx";
import HashLink from "../../components/ledger/HashLink.jsx";
import { EVENT_TONE, EVENT_TYPES, dateTime, timeAgo } from "../../components/ledger/format";
import { subscribeActivity } from "../../lib/activity";
import { getLedger } from "../../lib/ledger";
import { formatDate } from "../dashboard/format";

// Every transaction the contract has ever recorded, newest first, updating live.
export default function TransactionsView({ batchId: fixedBatch, compact = false }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(0);
  // Compact mode (on the Verify page) shows one batch's transactions and ignores the URL filters.
  const filters = compact
    ? { batchId: fixedBatch, address: "", type: "" }
    : { batchId: fixedBatch || params.get("batch") || "", address: params.get("address") || "", type: params.get("type") || "" };

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(
        await getLedger({
          batchId: filters.batchId.trim() || undefined,
          address: filters.address.trim() || undefined,
          type: filters.type || undefined,
        })
      );
    } catch (err) {
      setError(err.shortMessage || err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, fixedBatch]);

  useEffect(() => {
    load();
  }, [load]);

  // New blocks with our events trigger a reload, so the ledger is live.
  useEffect(() => subscribeActivity(() => setLive((n) => n + 1)), []);
  useEffect(() => {
    if (live) load();
  }, [live, load]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const columns = [
    { key: "time", header: "Time", render: (r) => <span title={dateTime(r.timestamp)}>{timeAgo(r.timestamp)}</span> },
    { key: "block", header: "Block", render: (r) => <HashLink kind="block" value={r.blockNumber} /> },
    { key: "tx", header: "Transaction", render: (r) => <HashLink kind="tx" value={r.txHash} /> },
    { key: "action", header: "Action", render: (r) => <Badge tone={EVENT_TONE[r.type]}>{r.label}</Badge> },
    {
      key: "subject",
      header: "Batch / participant",
      render: (r) =>
        r.batchId ? (
          <BatchLink id={r.batchId} />
        ) : (
          r.name || <HashLink kind="address" value={r.account} />
        ),
    },
    {
      key: "expiry",
      header: "Expiry date",
      render: (r) =>
        r.expiryDate ? (
          r.expiryDate * 1000 < Date.now() ? (
            <Badge tone="red">Expired {formatDate(r.expiryDate)}</Badge>
          ) : (
            formatDate(r.expiryDate)
          )
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: "signer", header: "Signed by", render: (r) => <HashLink kind="address" value={r.signer} /> },
    { key: "detail", header: "Detail", render: (r) => r.reason || r.drugName || r.role || "" },
  ];

  return (
    <Card
      title={compact ? "On-chain transactions" : "All transactions"}
      subtitle={compact ? "Every signed transaction for this batch, newest first. Click a row for the full receipt." : "Every entry is a signed blockchain transaction. Click a row for the full receipt."}
      actions={<Badge tone="green">● Live</Badge>}
    >
      {!compact && (<div className="ledger-filters">
        <Input label="Batch ID" value={filters.batchId} onChange={(e) => setFilter("batch", e.target.value)} placeholder="e.g. PCM-2026-001" />
        <Input label="Wallet address" value={filters.address} onChange={(e) => setFilter("address", e.target.value)} placeholder="0x…" />
        <Select
          label="Action"
          value={filters.type}
          onChange={(e) => setFilter("type", e.target.value)}
          options={[{ value: "", label: "All actions" }, ...EVENT_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
          Clear
        </Button>
      </div>)}
      {error && <Alert type="error" title="Couldn't read the ledger">{error}</Alert>}
      {rows === null ? (
        <Spinner label="Reading the chain…" />
      ) : (
        <Table
          columns={compact ? columns.filter((c) => c.key !== "subject") : columns}
          rows={rows}
          rowKey={(r) => `${r.txHash}-${r.logIndex}`}
          onRowClick={(r) => navigate(`/ledger/tx/${r.txHash}`)}
          empty={compact ? "No transactions for this batch yet." : "No transactions match these filters."}
        />
      )}
    </Card>
  );
}
