import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Spinner, Table, useToast } from "../ui";
import { approveTransfer, getPendingApprovals, rejectTransfer } from "../../lib/approvals";
import { getContract } from "../../lib/contract";
import BatchLink from "./BatchLink.jsx";
import HashLink from "./HashLink.jsx";
import "./ledger.css";

/**
 * Regulator's queue for step 3: handovers that the sender started and the receiver accepted.
 * Anyone can view it; only the regulator's wallet can approve or reject (the contract enforces it).
 * Drop-in usage: <ApprovalQueue />
 */
export default function ApprovalQueue() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState({});

  const load = useCallback(async () => {
    setError("");
    try {
      const pending = await getPendingApprovals();
      const c = await getContract();
      // Show names instead of raw addresses.
      const named = await Promise.all(
        pending.map(async (p) => {
          const [from, to] = await Promise.all([c.participants(p.from), c.participants(p.to)]);
          return { ...p, fromName: from.name || p.from, toName: to.name || p.to };
        })
      );
      setRows(named);
    } catch (err) {
      setError(err.shortMessage || err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (row, kind) => {
    setBusy(`${kind}:${row.batchId}`);
    const id = toast.pending("Confirm in MetaMask, then wait for the block…", { title: `${kind === "approve" ? "Approve" : "Reject"} ${row.batchId}` });
    try {
      if (kind === "approve") await approveTransfer(row.batchId);
      else await rejectTransfer(row.batchId, reasons[row.batchId]);
      toast.update(id, { type: "success", message: kind === "approve" ? "Approved: custody moved on-chain." : "Rejected: batch stays with the sender." });
      await load();
    } catch (err) {
      toast.update(id, { type: "error", message: err.message });
    } finally {
      setBusy("");
    }
  };

  const columns = [
    { key: "batch", header: "Batch", render: (r) => <strong><BatchLink id={r.batchId} /></strong> },
    { key: "route", header: "Handover", render: (r) => `${r.fromName} → ${r.toName}` },
    {
      key: "proof",
      header: "Signatures 1 & 2",
      render: (r) => (
        <span className="stack">
          <span>
            1 <HashLink kind="tx" value={r.initiatedTx} />
          </span>
          <span>
            2 <HashLink kind="tx" value={r.acceptedTx} />
          </span>
        </span>
      ),
    },
    {
      key: "act",
      header: "Step 3 (regulator)",
      render: (r) => (
        <div className="aq-actions">
          <Button size="sm" loading={busy === `approve:${r.batchId}`} disabled={!!busy} onClick={() => act(r, "approve")}>
            Approve
          </Button>
          <Input
            placeholder="Reason to reject"
            aria-label={`Reason to reject ${r.batchId}`}
            value={reasons[r.batchId] ?? ""}
            onChange={(e) => setReasons((x) => ({ ...x, [r.batchId]: e.target.value }))}
          />
          <Button
            size="sm"
            variant="danger"
            loading={busy === `reject:${r.batchId}`}
            disabled={!!busy || !reasons[r.batchId]?.trim()}
            onClick={() => act(r, "reject")}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      title="Regulator approvals (step 3 of 3)"
      subtitle="Custody only moves after the regulator countersigns. Only the regulator's wallet can act."
      actions={<Button size="sm" variant="secondary" onClick={load}>Refresh</Button>}
    >
      {error && <Alert type="error">{error}</Alert>}
      {rows === null ? <Spinner label="Loading pending handovers…" /> : <Table columns={columns} rows={rows} rowKey={(r) => r.batchId} empty="No handovers are waiting for approval." />}
    </Card>
  );
}
