import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui";
import HashLink from "../../components/ledger/HashLink.jsx";
import { EVENT_TONE, timeAgo } from "../../components/ledger/format";
import { getActivity, subscribeActivity } from "../../lib/activity";
import { CONTRACT_ADDRESS, isContractConfigured, NETWORK, addressUrl } from "../../lib/contract";
import { getChainOverview } from "../../lib/ledger";
import "./home.css";

// The supply chain, and who signs each hand-off. Roles come from the connected wallet, so these
// are an explanation, not links.
const CHAIN = [
  { who: "Manufacturer", note: "Creates the batch + lab-report fingerprint" },
  { who: "Distributor", note: "Receives and moves it on" },
  { who: "Pharmacy", note: "Final stop before the patient" },
];
const SIGNATURES = [
  ["1", "Sender initiates"],
  ["2", "Receiver confirms receipt"],
  ["3", "Regulator approves"],
];
const TRUST = [
  ["Tamper-evident", "Records live on a public blockchain; nobody, including us, can edit or delete them."],
  ["Signed by real wallets", "Every action is signed with a company's MetaMask key; the network checks the signature."],
  ["Verifiable by anyone", "Customers check a batch from its QR code with no wallet, no login, no app."],
  ["Recalls in seconds", "The regulator recalls a batch on-chain and every verify page shows it instantly."],
];

function VerifyBox() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const go = (e) => {
    e.preventDefault();
    if (id.trim()) navigate(`/verify/${encodeURIComponent(id.trim())}`);
  };
  return (
    <form className="home-verify" onSubmit={go}>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter a batch ID, e.g. PCM-2026-001" aria-label="Batch ID" />
      <button type="submit" disabled={!id.trim()}>Verify</button>
    </form>
  );
}

function LiveStats() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isContractConfigured()) return;
    const load = () => getChainOverview().then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const url = addressUrl(CONTRACT_ADDRESS);
  const stats = [
    ["Batches tracked", info?.totalBatches],
    ["On-chain transactions", info?.totalTransactions],
    ["Latest block", info ? `#${info.latestBlock.toLocaleString()}` : null],
    ["Network", NETWORK.name.replace(" Testnet", "")],
  ];
  return (
    <section className="home-stats" aria-label="Live blockchain stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <strong>{value ?? "…"}</strong>
          <span>{label}</span>
        </div>
      ))}
      {url && (
        <a className="home-contract" href={url} target="_blank" rel="noreferrer">
          View the smart contract on the block explorer ↗
        </a>
      )}
    </section>
  );
}

function RecentActivity() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!isContractConfigured()) return;
    getActivity({ limit: 6 }).then(setItems).catch(() => setItems([]));
    return subscribeActivity((item) => setItems((list) => [item, ...(list ?? [])].slice(0, 6)));
  }, []);
  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>Latest on-chain activity</h2>
        <Link to="/ledger">Full public ledger →</Link>
      </div>
      {items === null ? (
        <p className="muted">Reading the blockchain…</p>
      ) : items.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <ul className="home-activity">
          {items.map((i) => (
            <li key={`${i.txHash}-${i.logIndex}`}>
              <Badge tone={EVENT_TONE[i.type]}>{i.label}</Badge>
              <span className="home-activity-subject">{i.batchId ?? i.name ?? ""}</span>
              <span className="muted">{timeAgo(i.timestamp)}</span>
              <HashLink kind="tx" value={i.txHash} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Know where your medicine has been.</h1>
        <p>
          MediChain records every hand-off of a medicine batch on the blockchain, from
          manufacturer to pharmacy, so a fake batch has no history to show.
        </p>
        <VerifyBox />
        <div className="home-ctas">
          <Link to="/ledger" className="btn btn-secondary">Explore the public ledger</Link>
          <Link to="/dashboard" className="btn btn-primary">Company dashboard (MetaMask)</Link>
        </div>
      </section>

      <LiveStats />

      <section className="home-card">
        <h2>How a batch travels</h2>
        <ol className="home-chain">
          {CHAIN.map((c, i) => (
            <li key={c.who}>
              <div className="home-node">
                <strong>{c.who}</strong>
                <span>{c.note}</span>
              </div>
              {i < CHAIN.length - 1 && (
                <div className="home-hop" aria-label="hand-off">
                  {SIGNATURES.map(([n, label]) => (
                    <span key={n} className="sig" title={label}>✍ {n}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
        <ul className="home-sigs">
          {SIGNATURES.map(([n, label]) => (
            <li key={n}><span className="sig">✍ {n}</span> {label}</li>
          ))}
          <li className="muted">Custody moves only after all three signatures.</li>
        </ul>
      </section>

      <div className="home-grid">
        <RecentActivity />
        <section className="home-card">
          <h2>Why you can trust it</h2>
          <ul className="home-trust">
            {TRUST.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span className="muted">{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
