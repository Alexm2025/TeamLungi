import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ZeroAddress } from "ethers";
import { Alert, Badge, Card, Spinner, StatusBadge } from "../../components/ui";
import { DEMO_MODE } from "./chain";
import { fetchBatch, fetchParticipants, rememberBatch } from "./data";
import { friendlyError } from "./errors";
import { addressUrl, formatDate, formatDateTime, sameAddress, shortAddress } from "./format";
import RecallCard from "./RecallCard.jsx";
import TransferCard from "./TransferCard.jsx";
import { useWallet } from "./WalletContext";

// Name of a participant plus their short address, linked to the block explorer.
function Person({ address, people }) {
  if (!address) return "–";
  const name = people[address.toLowerCase()]?.name;
  return (
    <span className="person">
      {name && <strong>{name}</strong>}
      {DEMO_MODE ? (
        // sample addresses don't exist on the explorer, so no link
        <span className="mono small muted">{shortAddress(address)}</span>
      ) : (
        <a href={addressUrl(address)} target="_blank" rel="noreferrer" className="mono">
          {shortAddress(address)}
        </a>
      )}
    </span>
  );
}

// Which hand-over buttons this account gets for this batch (empty = none).
function availableActions(batch, account, participant) {
  if (!account || batch.status === 4) return [];
  if (sameAddress(batch.pendingReceiver, account)) return ["accept"];
  if (!sameAddress(batch.currentOwner, account)) return [];
  if (batch.pendingReceiver) return ["cancel"];
  const canSend = participant.active && (participant.role === 1 || participant.role === 2);
  return canSend ? ["send"] : [];
}

export default function BatchDetail() {
  const { batchId } = useParams();
  const { account, participant } = useWallet();
  const [state, setState] = useState({ loading: true });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    (async () => {
      try {
        const { batch, handovers } = await fetchBatch(batchId);
        const addresses = [
          batch.manufacturer,
          batch.currentOwner,
          batch.pendingReceiver,
          ...handovers.flatMap((h) => [h.from, h.to]),
        ].filter((a) => a && a !== ZeroAddress);
        const people = await fetchParticipants(addresses);
        if (cancelled) return;
        rememberBatch(batchId);
        setState({ loading: false, batch, handovers, people });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: friendlyError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, version]);

  const back = (
    <Link to="/dashboard" className="back-link">
      ← Dashboard
    </Link>
  );

  if (state.loading && !state.batch) return <Spinner label="Loading batch from the blockchain…" />;
  if (state.error) {
    return (
      <>
        {back}
        <Alert type="error" title={`Couldn't load batch “${batchId}”`}>
          {state.error}
        </Alert>
      </>
    );
  }

  const { batch, handovers, people } = state;
  const expired = batch.expiryDate < Date.now() / 1000;
  const actions = availableActions(batch, account, participant);
  // Same rule as the contract: the regulator, or the batch's own manufacturer
  const mayRecall =
    batch.status !== 4 &&
    ((participant.active && participant.role === 4) || sameAddress(batch.manufacturer, account));

  return (
    <div className="dashboard">
      {back}
      <header className="page-header">
        <div className="title-row">
          <h1 className="mono">{batch.batchId}</h1>
          <StatusBadge status={batch.status} />
          {expired && <Badge tone="red">Expired</Badge>}
        </div>
        <p className="muted">
          {batch.drugName} · {batch.quantity} units
        </p>
      </header>

      {batch.status === 4 && (
        <Alert type="error" title="This batch has been recalled">
          {batch.recallReason || "No reason given."}
        </Alert>
      )}

      <div className="dash-grid">
        <Card title="Details">
          <dl className="details">
            <dt>Drug</dt>
            <dd>{batch.drugName}</dd>
            <dt>Quantity</dt>
            <dd>{batch.quantity}</dd>
            <dt>Manufactured</dt>
            <dd>{formatDate(batch.mfgDate)}</dd>
            <dt>Expires</dt>
            <dd>{formatDate(batch.expiryDate)}</dd>
            <dt>Manufacturer</dt>
            <dd>
              <Person address={batch.manufacturer} people={people} />
            </dd>
            <dt>Current holder</dt>
            <dd>
              <Person address={batch.currentOwner} people={people} />
            </dd>
            {batch.pendingReceiver && (
              <>
                <dt>Being sent to</dt>
                <dd>
                  <Person address={batch.pendingReceiver} people={people} />
                </dd>
              </>
            )}
            <dt>Registered</dt>
            <dd>{formatDateTime(batch.createdAt)}</dd>
            <dt>Certificate hash</dt>
            <dd className="mono small">{batch.docHash ?? "None uploaded"}</dd>
          </dl>
          <Link to={`/verify/${encodeURIComponent(batch.batchId)}`}>Open public verification page →</Link>
        </Card>

        <Card title="Custody history" subtitle={`${handovers.length} recorded hand-overs`}>
          <ol className="timeline">
            {handovers.map((h, i) => (
              <li key={i} className="timeline-item">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  {h.from === ZeroAddress ? (
                    <>
                      Created by <Person address={h.to} people={people} />
                    </>
                  ) : (
                    <>
                      <Person address={h.from} people={people} /> →{" "}
                      <Person address={h.to} people={people} />
                    </>
                  )}
                  <p className="muted small">
                    {formatDateTime(h.timestamp)}
                    {h.location && ` · ${h.location}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {actions.length > 0 && (
          <TransferCard batchId={batch.batchId} lockId actions={actions} onDone={reload} />
        )}
        {mayRecall && <RecallCard batchId={batch.batchId} lockId onDone={reload} />}
      </div>
    </div>
  );
}
