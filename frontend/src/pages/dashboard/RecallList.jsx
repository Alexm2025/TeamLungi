import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Spinner, Table } from "../../components/ui";
import { CHAIN_ID, DEPLOY_BLOCK } from "./chain";
import { loadRecalls } from "./data";
import { friendlyError } from "./errors";
import { formatDateTime, shortAddress, txUrl } from "./format";

// Without a deploy block, the search would start at block 0. That's fine on a local
// Hardhat chain but means millions of blocks on Amoy, so we skip it there.
const CAN_SEARCH = DEPLOY_BLOCK > 0 || CHAIN_ID === 31337;

const COLUMNS = [
  {
    key: "batchId",
    header: "Batch",
    render: (r) => (
      <Link to={`/verify/${encodeURIComponent(r.batchId)}`} className="mono">
        {r.batchId}
      </Link>
    ),
  },
  { key: "reason", header: "Reason" },
  { key: "by", header: "By", render: (r) => <span className="mono">{shortAddress(r.by)}</span> },
  {
    key: "timestamp",
    header: "When",
    render: (r) =>
      r.txHash ? (
        <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
          {formatDateTime(r.timestamp)}
        </a>
      ) : (
        formatDateTime(r.timestamp)
      ),
  },
];

// Every recall so far, newest first (read from the contract's BatchRecalled events).
export default function RecallList({ version, onRefresh }) {
  const [state, setState] = useState({ loading: CAN_SEARCH, rows: [], error: "" });

  useEffect(() => {
    if (!CAN_SEARCH) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loadRecalls()
      .then((rows) => !cancelled && setState({ loading: false, rows, error: "" }))
      .catch((err) => !cancelled && setState({ loading: false, rows: [], error: friendlyError(err) }));
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <Card
      title="Recalled batches"
      actions={
        CAN_SEARCH && (
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={state.loading}>
            Refresh
          </Button>
        )
      }
    >
      {!CAN_SEARCH ? (
        <p className="muted">
          The recall list needs <code>VITE_DEPLOY_BLOCK</code> to be set. Recalled batches still
          show as recalled on their own pages.
        </p>
      ) : state.loading ? (
        <Spinner label="Reading recalls from the blockchain…" />
      ) : state.error ? (
        <Alert type="error">{state.error}</Alert>
      ) : (
        <Table columns={COLUMNS} rows={state.rows} rowKey={(r) => r.txHash ?? r.batchId} empty="No batches have been recalled." />
      )}
    </Card>
  );
}
