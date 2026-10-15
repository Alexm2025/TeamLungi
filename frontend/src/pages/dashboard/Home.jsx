import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui";
import HashLink from "../../components/ledger/HashLink.jsx";
import { EVENT_TONE, timeAgo } from "../../components/ledger/format";
import { getActivity, subscribeActivity } from "../../lib/activity";
import { CONTRACT_ADDRESS, NETWORK, ROLE, addressUrl, isContractConfigured } from "../../lib/contract";
import { getChainOverview } from "../../lib/ledger";
import { shortAddress } from "./format";
import { ROLE_OPTIONS, useWallet } from "./WalletContext";
import "./home.css";

// Thin line icons (24px grid), drawn to match the interface rather than decorate it.
const ICONS = {
  manufacturer: (
    <path d="M3 21V10l5 3V10l5 3V7l8 4v10H3Zm4-4h2m4 0h2m-6-3h2m4 0h2" />
  ),
  distributor: (
    <path d="M2 7h11v9H2zM13 10h4l4 3v3h-8M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
  ),
  pharmacy: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  regulator: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5" />,
};

const ROLE_COPY = {
  manufacturer: "Register batches and start each hand-off",
  distributor: "Confirm receipt and move stock onward",
  pharmacy: "Receive and dispense verified stock",
  regulator: "Approve hand-offs and issue recalls",
};

const Icon = ({ name }) => (
  <svg className="hx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);

function VerifyForm() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (id.trim()) navigate(`/verify/${encodeURIComponent(id.trim())}`);
  };
  return (
    <form className="hx-verify" onSubmit={submit}>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Batch ID, e.g. PCM-2026-001" aria-label="Batch ID" />
      <button type="submit" disabled={!id.trim()}>Verify batch</button>
    </form>
  );
}

function HeroStats() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isContractConfigured()) return;
    const load = () => getChainOverview().then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const stats = [
    [info?.totalBatches, "Batches on-chain"],
    [info?.totalTransactions, "Signed transactions"],
    [info ? `#${info.latestBlock.toLocaleString()}` : null, "Latest block"],
  ];
  return (
    <dl className="hx-stats">
      {stats.map(([v, label]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// Choose a role, then connect MetaMask. Once signed in, only that role is shown until log-out.
function SignInPanel() {
  const navigate = useNavigate();
  const { signedIn, sessionRole, account, participant, isAdmin, connecting, error, signIn, signOut } = useWallet();
  const [selected, setSelected] = useState(null);
  const hasWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  if (signedIn) {
    const label = ROLE_OPTIONS[sessionRole]?.label ?? ROLE[participant.role];
    return (
      <div className="hx-panel">
        <p className="hx-eyebrow">Signed in</p>
        <div className="hx-session">
          <span className="hx-session-icon"><Icon name={sessionRole} /></span>
          <div>
            <strong>{label}{isAdmin ? " · Admin" : ""}</strong>
            <span>{participant.name || "Registered participant"}{participant.location ? ` · ${participant.location}` : ""}</span>
            <code>{shortAddress(account)}</code>
          </div>
        </div>
        <Link to="/dashboard" className="hx-primary">Open {label.toLowerCase()} dashboard</Link>
        <button type="button" className="hx-secondary" onClick={signOut}>Log out and disconnect</button>
        <p className="hx-note">
          Other roles are hidden while you're signed in. To use a different role, log out, then
          sign in again with that role's MetaMask account.
        </p>
      </div>
    );
  }

  const go = async () => {
    if (await signIn(selected)) navigate("/dashboard");
  };

  return (
    <div className="hx-panel">
      <p className="hx-eyebrow">Participant sign-in</p>
      <h2>Select your role</h2>
      <div className="hx-roles" role="radiogroup" aria-label="Role">
        {Object.entries(ROLE_OPTIONS).map(([key, opt]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected === key}
            className={`hx-role${selected === key ? " is-selected" : ""}`}
            onClick={() => setSelected(key)}
          >
            <Icon name={key} />
            <strong>{opt.label}</strong>
            <span>{ROLE_COPY[key]}</span>
          </button>
        ))}
      </div>
      <button type="button" className="hx-primary" disabled={!selected || connecting || !hasWallet} onClick={go}>
        {connecting ? "Waiting for MetaMask…" : selected ? `Connect MetaMask as ${ROLE_OPTIONS[selected].label}` : "Connect MetaMask"}
      </button>
      {!hasWallet && <p className="hx-error">MetaMask isn't installed in this browser.</p>}
      {error && <p className="hx-error">{error}</p>}
      <p className="hx-note">Your wallet must be registered for the selected role by the network administrator. The contract checks it on sign-in.</p>
    </div>
  );
}

function Activity() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!isContractConfigured()) return;
    getActivity({ limit: 7 }).then(setItems).catch(() => setItems([]));
    return subscribeActivity((item) => setItems((list) => [item, ...(list ?? [])].slice(0, 7)));
  }, []);
  return (
    <section className="hx-card">
      <header className="hx-card-head">
        <div>
          <p className="hx-eyebrow dark">Live ledger</p>
          <h2>Latest on-chain activity</h2>
        </div>
        <Link to="/ledger">Open public ledger</Link>
      </header>
      {items === null ? (
        <p className="muted">Reading the blockchain…</p>
      ) : items.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <ul className="hx-activity">
          {items.map((i) => (
            <li key={`${i.txHash}-${i.logIndex}`}>
              <Badge tone={EVENT_TONE[i.type]}>{i.label}</Badge>
              <span className="hx-subject">{i.batchId ?? i.name ?? ""}</span>
              <span className="hx-time">{timeAgo(i.timestamp)}</span>
              <HashLink kind="tx" value={i.txHash} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const FLOW = [
  ["Manufacturer", "Creates the batch and its lab-report fingerprint"],
  ["Distributor", "Receives, stores and moves the batch onward"],
  ["Pharmacy", "Final custodian before the patient"],
];

const ASSURANCE = [
  ["Immutable record", "Entries are written to a public blockchain. No one, including the operators, can alter or delete them."],
  ["Cryptographic identity", "Each action is signed by the participant's MetaMask key and verified by the network."],
  ["Enforced by contract", "Roles, permitted routes, approvals and recalls are rules in the smart contract, not settings in an app."],
  ["Open verification", "Anyone can verify a batch from its QR code: no account, no wallet, no fee."],
];

export default function Home() {
  const contractUrl = addressUrl(CONTRACT_ADDRESS);
  return (
    <div className="hx">
      <section className="hx-hero">
        <div className="hx-hero-main">
          <p className="hx-eyebrow">Pharmaceutical supply-chain integrity</p>
          <h1>
            Every batch. Every hand-off.
            <br />
            <span>Provable.</span>
          </h1>
          <p className="hx-lead">
            MediChain records the custody of medicine batches on {NETWORK.name.replace(" Testnet", "")}, from
            manufacturer to pharmacy. Each transfer is countersigned by three parties and can be verified by anyone.
          </p>
          <VerifyForm />
          <HeroStats />
          {contractUrl && (
            <a className="hx-contract" href={contractUrl} target="_blank" rel="noreferrer">
              Smart contract {shortAddress(CONTRACT_ADDRESS)} on block explorer ↗
            </a>
          )}
        </div>
        <SignInPanel />
      </section>

      <section className="hx-card">
        <p className="hx-eyebrow dark">Custody protocol</p>
        <h2>Three signatures on every hand-off</h2>
        <ol className="hx-flow">
          {FLOW.map(([who, what], i) => (
            <li key={who}>
              <div className="hx-node">
                <span className="hx-node-idx">0{i + 1}</span>
                <strong>{who}</strong>
                <span>{what}</span>
              </div>
              {i < FLOW.length - 1 && (
                <div className="hx-link" aria-hidden="true">
                  <span>Sender</span>
                  <span>Receiver</span>
                  <span>Regulator</span>
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="muted hx-flow-note">
          Custody changes only after the sender initiates, the receiver confirms receipt and the regulator approves.
        </p>
      </section>

      <div className="hx-grid">
        <Activity />
        <section className="hx-card">
          <p className="hx-eyebrow dark">Assurance</p>
          <h2>Why the record can be trusted</h2>
          <ul className="hx-assure">
            {ASSURANCE.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
