import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Badge, Card, Spinner } from "../../components/ui";
import BatchLink from "../../components/ledger/BatchLink.jsx";
import HashLink from "../../components/ledger/HashLink.jsx";
import { EVENT_TONE, dateTime, short, timeAgo } from "../../components/ledger/format";
import { getBlockDetails, getLedgerBlocks } from "../../lib/ledger";

// The blocks holding MedChain transactions, drawn as a chain: each block stores its parent's hash,
// so changing any old block would change every hash after it.
export function BlocksView() {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getLedgerBlocks({ limit: 30 })
      .then(setBlocks)
      .catch((err) => setError(err.shortMessage || err.message));
  }, []);

  if (error) return <Alert type="error" title="Couldn't load blocks">{error}</Alert>;
  if (!blocks) return <Spinner label="Reading block headers…" />;

  return (
    <Card
      title="Block chain view"
      subtitle="Newest first. Every block points to the hash of the block before it; that link is what makes history tamper-evident."
    >
      {blocks.length === 0 && <p className="muted">No blocks with MedChain activity yet.</p>}
      <ol className="chain">
        {blocks.map((b, i) => {
          const older = blocks[i + 1];
          const gap = older ? b.number - older.number - 1 : 0;
          return (
            <li key={b.number}>
              <div className="block-card">
                <div className="block-head">
                  <HashLink kind="block" value={b.number} />
                  <span className="muted" title={dateTime(b.timestamp)}>{timeAgo(b.timestamp)}</span>
                </div>
                <div className="block-row"><span>Hash</span><span className="mono">{short(b.hash, 12, 8)}</span></div>
                <div className="block-row"><span>Parent hash</span><span className="mono">{short(b.parentHash, 12, 8)}</span></div>
                <div className="block-events">
                  {b.events.map((e) => (
                    <span key={`${e.txHash}-${e.logIndex}`}>
                      <Link to={`/ledger/tx/${e.txHash}`}>
                        <Badge tone={EVENT_TONE[e.type]}>{e.label}</Badge>
                      </Link>
                      {e.batchId && <> <BatchLink id={e.batchId} /></>}
                    </span>
                  ))}
                </div>
                <div className="muted small">{b.txCount} transaction(s) in this block in total</div>
              </div>
              {older && (
                <div className="chain-link" aria-hidden="true">
                  ↓ parent hash links back{gap > 0 ? ` through ${gap.toLocaleString()} other block(s)` : ""}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function BlockDetail() {
  const { number } = useParams();
  const [block, setBlock] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    setBlock(undefined);
    getBlockDetails(number)
      .then(setBlock)
      .catch((err) => setError(err.shortMessage || err.message));
  }, [number]);

  if (error) return <Alert type="error" title="Couldn't load block">{error}</Alert>;
  if (block === undefined) return <Spinner label="Fetching block header…" />;
  if (block === null) return <Alert type="error">Block not found.</Alert>;

  const prev = block.number - 1;
  return (
    <div className="ledger-stack">
      <p>
        <Link to="/ledger/blocks">← Block chain view</Link>
      </p>
      <Card title={`Block #${block.number}`} subtitle={dateTime(block.timestamp)}>
        <dl className="kv">
          <div><dt>Block hash</dt><dd className="mono-wrap">{block.hash}</dd></div>
          <div>
            <dt>Parent hash</dt>
            <dd className="mono-wrap">
              {block.parentHash} <Link to={`/ledger/block/${prev}`}>(block #{prev})</Link>
            </dd>
          </div>
          <div><dt>Produced by</dt><dd><HashLink kind="address" value={block.miner} full /></dd></div>
          <div><dt>Transactions</dt><dd>{block.txCount} total, {block.medchainTxs.length} MedChain</dd></div>
          <div><dt>Gas used / limit</dt><dd>{Number(block.gasUsed).toLocaleString()} / {Number(block.gasLimit).toLocaleString()}</dd></div>
        </dl>
      </Card>
      <Card title="MedChain transactions in this block">
        {block.medchainTxs.length === 0 ? (
          <p className="muted">None. This block holds other users' transactions.</p>
        ) : (
          <ul className="plain-list">
            {block.medchainEvents.map((e) => (
              <li key={`${e.txHash}-${e.logIndex}`}>
                <Badge tone={EVENT_TONE[e.type]}>{e.label}</Badge> {e.batchId ? <BatchLink id={e.batchId} /> : e.name ?? ""} · <HashLink kind="tx" value={e.txHash} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
