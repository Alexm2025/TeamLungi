import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useParams } from "react-router-dom";
import { Alert, Card } from "../../components/ui";
import ApprovalQueue from "../../components/ledger/ApprovalQueue.jsx";
import HashLink from "../../components/ledger/HashLink.jsx";
import { isContractConfigured, NETWORK } from "../../lib/contract";
import { getChainOverview } from "../../lib/ledger";
import { BlockDetail, BlocksView } from "./BlocksView.jsx";
import TransactionsView from "./TransactionsView.jsx";
import TxDetail from "./TxDetail.jsx";
import "../../components/ledger/ledger.css";

const TABS = [
  { to: "/ledger", label: "Transactions", end: true },
  { to: "/ledger/blocks", label: "Blocks" },
  { to: "/ledger/approvals", label: "Approvals" },
  { to: "/ledger/how", label: "How it's secured" },
];

function Overview() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => getChainOverview().then(setInfo).catch((err) => setError(err.shortMessage || err.message));
    load();
    const t = setInterval(load, 15000); // keep the latest block number fresh
    return () => clearInterval(t);
  }, []);

  if (error) return <Alert type="error" title="Can't reach the blockchain">{error}</Alert>;
  const stats = [
    ["Network", info ? `${info.network} (chain ${info.chainId})` : "…"],
    ["Contract", info ? <HashLink kind="address" value={info.contractAddress} /> : "…"],
    ["Latest block", info ? <HashLink kind="block" value={info.latestBlock} /> : "…"],
    ["Batches", info?.totalBatches ?? "…"],
    ["Transactions", info?.totalTransactions ?? "…"],
  ];
  return (
    <div className="ledger-stats">
      {stats.map(([k, v]) => (
        <div key={k} className="stat">
          <span className="muted small">{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const points = [
    ["Every action is a signed transaction", "Creating, moving or recalling a batch is a transaction signed with the actor's private key (ECDSA). The network recovers the signer's address from the signature, so nobody can act for someone else."],
    ["3 signatures per handover", "Sender initiates, receiver accepts, regulator approves. Custody only moves on the third signature, enforced by the smart contract itself."],
    ["Blocks are hash-linked", "Each block stores the hash of the block before it. Changing any past entry changes its block's hash and breaks every later link, so tampering is detectable by anyone."],
    ["Replicated, not stored by us", `The data lives on thousands of ${NETWORK.name} nodes. This site has no database; it reads the chain through a public RPC, and every page links to an independent explorer to cross-check.`],
    ["3-layer verification in your browser", "The Verify page recomputes everything from raw chain data: the record, each hop's 3 signers, and the lab report's SHA-256 fingerprint."],
    ["Rules enforced in code", "Role checks, allowed routes (manufacturer → distributor → pharmacy), recall locks and expiry are all checked by the contract, covered by 32 automated tests."],
  ];
  return (
    <Card title="How this ledger is secured">
      <ol className="how-list">
        {points.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <p className="muted">{text}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ToVerify() {
  const { batchId } = useParams();
  return <Navigate to={`/verify/${encodeURIComponent(batchId)}`} replace />;
}

/** Public ledger and block explorer. Mounted by App.jsx at /ledger/*. */
export default function LedgerPage() {
  if (!isContractConfigured()) {
    return (
      <Card title="Public ledger">
        <Alert type="info" title="Contract not connected yet">
          The ledger reads live from the deployed MedChain contract. It appears here as soon as the contract
          address is configured.
        </Alert>
        <HowItWorks />
      </Card>
    );
  }

  return (
    <div className="ledger-stack">
      <header>
        <h1>Public ledger</h1>
        <p className="muted">
          Every transaction, block and signature behind MediChain, read live from the blockchain. Anyone can view it;
          no login needed.
        </p>
      </header>
      <Overview />
      <nav className="ledger-tabs" aria-label="Ledger sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "active" : "")}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<TransactionsView />} />
        <Route path="blocks" element={<BlocksView />} />
        <Route path="block/:number" element={<BlockDetail />} />
        <Route path="tx/:hash" element={<TxDetail />} />
        {/* Batch checks now live on the Verify page; keep old links working. */}
        <Route path="batch" element={<Navigate to="/verify" replace />} />
        <Route path="batch/:batchId" element={<ToVerify />} />
        <Route path="approvals" element={<ApprovalQueue />} />
        <Route path="how" element={<HowItWorks />} />
      </Routes>
    </div>
  );
}
