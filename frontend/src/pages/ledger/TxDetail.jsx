import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Badge, Card, Spinner } from "../../components/ui";
import HashLink from "../../components/ledger/HashLink.jsx";
import { dateTime } from "../../components/ledger/format";
import { getTransactionDetails } from "../../lib/ledger";
import { txUrl } from "../../lib/contract";

// One transaction's full receipt, like a block explorer page.
export default function TxDetail() {
  const { hash } = useParams();
  const [tx, setTx] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    setTx(undefined);
    getTransactionDetails(hash)
      .then(setTx)
      .catch((err) => setError(err.shortMessage || err.message));
  }, [hash]);

  if (error) return <Alert type="error" title="Couldn't load transaction">{error}</Alert>;
  if (tx === undefined) return <Spinner label="Fetching receipt from the chain…" />;
  if (tx === null) return <Alert type="error">Transaction not found on this network.</Alert>;

  const rows = [
    ["Transaction hash", <span className="mono-wrap">{tx.hash}</span>],
    ["Status", <Badge tone={tx.status === "success" ? "green" : tx.status === "failed" ? "red" : "amber"}>{tx.status}</Badge>],
    ["Block", <HashLink kind="block" value={tx.blockNumber} />],
    ["Block hash", <span className="mono-wrap">{tx.blockHash}</span>],
    ["Confirmations", `${tx.confirmations} (its own block plus every block after it; rewriting it would mean redoing all of them)`],
    ["Timestamp", dateTime(tx.timestamp)],
    ["Signed by (from)", <HashLink kind="address" value={tx.from} full />],
    ["Contract (to)", <HashLink kind="address" value={tx.to} full />],
    ["Nonce", `${tx.nonce} (this wallet's transaction counter; stops replays)`],
    ["Gas used", tx.gasUsed],
    ["Gas price", `${tx.gasPriceGwei.toFixed(3)} gwei`],
    ["Fee paid", tx.fee],
  ];

  return (
    <div className="ledger-stack">
      <p>
        <Link to="/ledger">← All transactions</Link>
      </p>
      <Card
        title={tx.call ? `${tx.call.name}()` : "Transaction"}
        subtitle="Read live from the blockchain. Cross-check on the public explorer."
        actions={txUrl(tx.hash) && <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">Open in explorer ↗</a>}
      >
        <dl className="kv">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {tx.call && (
        <Card title="Function call (decoded input)" subtitle={<span className="mono">{tx.call.signature}</span>}>
          <dl className="kv">
            {Object.entries(tx.call.args).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="mono-wrap">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card title="Events emitted (on-chain log)">
        {tx.events.length === 0 ? (
          <p className="muted">No MedChain events.</p>
        ) : (
          tx.events.map((e) => (
            <div key={e.logIndex} className="event-box">
              <strong>{e.name}</strong>
              <dl className="kv">
                {Object.entries(e.args).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className="mono-wrap">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </Card>

      {tx.signature && (
        <Card
          title="Digital signature (ECDSA secp256k1)"
          subtitle="The network recovers the signer's address from these values. Only the holder of that wallet's private key could have produced them."
        >
          <dl className="kv">
            <div><dt>r</dt><dd className="mono-wrap">{tx.signature.r}</dd></div>
            <div><dt>s</dt><dd className="mono-wrap">{tx.signature.s}</dd></div>
            <div><dt>v</dt><dd className="mono">{tx.signature.v}</dd></div>
            <div><dt>Recovered signer</dt><dd><HashLink kind="address" value={tx.from} full /></dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
}
