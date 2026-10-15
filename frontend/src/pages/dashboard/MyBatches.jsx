import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, Spinner, StatusBadge, Table } from "../../components/ui";
import { loadMyBatches } from "./data";
import { friendlyError } from "./errors";
import { formatDate, sameAddress } from "./format";
import { useTx } from "./useTx";

// How this account relates to a batch; `order` puts things that need action first.
function relation(batch, account) {
  if (sameAddress(batch.pendingReceiver, account)) return { label: "Incoming: accept it", order: 0 };
  if (sameAddress(batch.currentOwner, account) && batch.pendingReceiver) {
    return { label: "Sent, waiting for receiver", order: 1 };
  }
  if (sameAddress(batch.currentOwner, account)) return { label: "In your custody", order: 2 };
  return { label: "Passed on", order: 3 };
}

// Every batch this account made, holds, is about to receive or has passed on, with quick actions.
export default function MyBatches({ account, version, canSend, onSend, onChange }) {
  const [state, setState] = useState({ loading: true, batches: [], eventsFailed: false, error: "" });
  const [rowBusy, setRowBusy] = useState(null);
  const { run } = useTx();

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loadMyBatches(account)
      .then((r) => !cancelled && setState({ loading: false, error: "", ...r }))
      .catch(
        (err) =>
          !cancelled &&
          setState({ loading: false, batches: [], eventsFailed: false, error: friendlyError(err) })
      );
    return () => {
      cancelled = true;
    };
  }, [account, version]);

  const quick = async (kind, batchId) => {
    setRowBusy(batchId);
    const receipt = await run(
      kind === "accept" ? `Accept ${batchId}` : `Cancel transfer of ${batchId}`,
      (c) => (kind === "accept" ? c.acceptTransfer(batchId) : c.cancelTransfer(batchId))
    );
    setRowBusy(null);
    if (receipt) onChange();
  };

  const now = Date.now() / 1000;
  const rows = state.batches
    .map((b) => ({ ...b, rel: relation(b, account) }))
    .sort((a, b) => a.rel.order - b.rel.order);

  const columns = [
    {
      key: "batchId",
      header: "Batch",
      render: (b) => (
        <Link to={`/verify/${encodeURIComponent(b.batchId)}`} className="mono">
          {b.batchId}
        </Link>
      ),
    },
    { key: "drugName", header: "Drug" },
    { key: "quantity", header: "Qty" },
    {
      key: "expiryDate",
      header: "Expires",
      render: (b) =>
        b.expiryDate < now ? <Badge tone="red">Expired {formatDate(b.expiryDate)}</Badge> : formatDate(b.expiryDate),
    },
    { key: "status", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
    { key: "rel", header: "You", render: (b) => b.rel.label },
    {
      key: "actions",
      header: "",
      render: (b) => {
        const busy = rowBusy === b.batchId;
        if (b.rel.order === 0) {
          return (
            <Button size="sm" loading={busy} disabled={Boolean(rowBusy)} onClick={() => quick("accept", b.batchId)}>
              Accept
            </Button>
          );
        }
        if (b.rel.order === 1) {
          return (
            <Button size="sm" variant="ghost" loading={busy} disabled={Boolean(rowBusy)} onClick={() => quick("cancel", b.batchId)}>
              Cancel
            </Button>
          );
        }
        if (b.rel.order === 2 && canSend && b.status !== 4) {
          return (
            <Button size="sm" variant="secondary" onClick={() => onSend(b.batchId)}>
              Send…
            </Button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <Card
      title="My batches"
      subtitle="Batches you made, hold, are about to receive, or have passed on."
      actions={
        <Button size="sm" variant="ghost" onClick={onChange} disabled={state.loading}>
          Refresh
        </Button>
      }
    >
      {state.eventsFailed && (
        <Alert type="info" className="mb">
          Couldn't search the full blockchain history, so this list shows batches this browser
          has seen. Use “Find a batch” to open any other batch.
        </Alert>
      )}
      {state.error && <Alert type="error">{state.error}</Alert>}
      {state.loading ? (
        <Spinner label="Searching the blockchain for your batches…" />
      ) : (
        !state.error && (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(b) => b.batchId}
            empty="No batches yet."
          />
        )
      )}
    </Card>
  );
}
