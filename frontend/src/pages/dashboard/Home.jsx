import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { CONTRACT_ADDRESS, isContractConfigured, NETWORK, ROLE, addressUrl } from "../../lib/contract";
import { getChainOverview } from "../../lib/ledger";
import { shortAddress } from "./format";
import { useWallet } from "./WalletContext";
import "./home.css";

// Small line icons, drawn in the current text colour.
const svg = (path) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);
const ICONS = {
  factory: svg(<><path d="M3 21V10l6 4V10l6 4V5h6v16z" /><path d="M7 17h2M12 17h2M17 17h2" /></>),
  truck: svg(<><path d="M2 6h11v10H2zM13 10h4l4 4v2h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  pharmacy: svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>),
  search: svg(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>),
  lock: svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  pen: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>),
  eye: svg(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  alert: svg(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>),
};

const ROLES = [
  { key: "manufacturer", label: "Manufacturer", role: 1, icon: "factory", text: "Create batches and send them to distributors." },
  { key: "distributor", label: "Distributor", role: 2, icon: "truck", text: "Accept batches and pass them on to pharmacies." },
  { key: "pharmacy", label: "Pharmacist", role: 3, icon: "pharmacy", text: "Accept the batches that arrive at your pharmacy." },
  { key: "anyone", label: "Anyone", icon: "search", text: "Check a medicine's origin and journey. No wallet needed." },
];

const STEPS = [
  { title: "Manufacturer registers the batch", text: "Drug, dates, quantity and the lab report's fingerprint are written to the blockchain." },
  { title: "Every hand-off is signed 3 times", text: "The sender sends, the receiver confirms receipt, the regulator approves. Only then does custody move.", sigs: true },
  { title: "The pharmacy receives it", text: "The last stop before the patient. The whole journey is now on record." },
  { title: "Anyone can verify it", text: "Scan the QR code or type the batch ID to see origin, journey, expiry and recalls. No login." },
];

const TRUST = [
  { icon: "lock", title: "Can't be edited", text: "Records live on a public blockchain. Nobody, including us, can change or delete them." },
  { icon: "pen", title: "Signed by real companies", text: "Every action is signed with the company's own wallet, so it's always clear who did what." },
  { icon: "eye", title: "Open to everyone", text: "Anyone can check a batch or browse the public ledger. No account, no app." },
  { icon: "alert", title: "Recalls in seconds", text: "The regulator recalls a batch on-chain and every verification shows the warning at once." },
];

// Company roles: connect MetaMask, then open that role's dashboard.
function CompanyNext({ choice }) {
  const { account, participant, loadingRole, connecting, connect, error } = useWallet();
  const navigate = useNavigate();
  const [goAfterConnect, setGoAfterConnect] = useState(false);
  const target = `/dashboard?role=${choice.key}`;

  // Continue to the dashboard as soon as MetaMask reports the account.
  useEffect(() => {
    if (goAfterConnect && account) navigate(target);
  }, [goAfterConnect, account, navigate, target]);
  useEffect(() => {
    if (error) setGoAfterConnect(false);
  }, [error]);

  if (!window.ethereum) {
    return (
      <div className="role-next">
        <p>
          You'll need the <strong>MetaMask</strong> browser extension to sign in as a {choice.label.toLowerCase()}.
          Install it from <a href="https://metamask.io" target="_blank" rel="noreferrer">metamask.io</a>, then reload this page.
        </p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="role-next">
        <p>Sign in with the MetaMask wallet registered for your company.</p>
        <Button
          onClick={() => {
            setGoAfterConnect(true);
            connect();
          }}
          loading={connecting}
        >
          {connecting ? "Connecting…" : "Connect MetaMask"}
        </Button>
        {error && <p className="role-error">{error}</p>}
      </div>
    );
  }

  // Already connected: the wallet's on-chain role decides the dashboard, so say if it differs.
  const registered = participant.active ? participant.role : 0;
  let note = `Connected as ${shortAddress(account)}.`;
  if (loadingRole) note += " Checking your role…";
  else if (!registered) note += " This wallet isn't registered yet; the dashboard shows how to get registered.";
  else if (registered !== choice.role) {
    note += ` This wallet is registered as ${ROLE[registered]}. Switch account in MetaMask to act as a ${choice.label.toLowerCase()}.`;
  }

  return (
    <div className="role-next">
      <p>{note}</p>
      <Button onClick={() => navigate(target)}>Continue to dashboard</Button>
    </div>
  );
}

// "Anyone": check a batch without a wallet.
function AnyoneNext() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const go = (e) => {
    e.preventDefault();
    if (id.trim()) navigate(`/verify/${encodeURIComponent(id.trim())}`);
  };
  return (
    <div className="role-next">
      <form className="home-verify" onSubmit={go}>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Enter a batch ID, e.g. PCM-2026-001"
          aria-label="Batch ID"
        />
        <Button type="submit" disabled={!id.trim()}>Verify</Button>
      </form>
      <p className="muted small">
        Have the pack in hand? <Link to="/verify">Scan its QR code instead →</Link>
      </p>
    </div>
  );
}

function RolePicker() {
  const [choiceKey, setChoiceKey] = useState(null);
  const choice = ROLES.find((r) => r.key === choiceKey);

  return (
    <section className="home-card home-start" aria-labelledby="start-title">
      <h2 id="start-title">Who are you?</h2>
      <p className="muted">Pick your role to get started.</p>
      <div className="role-grid">
        {ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={choiceKey === r.key}
            className={`role-option${choiceKey === r.key ? " selected" : ""}`}
            onClick={() => setChoiceKey(r.key)}
          >
            <span className="role-icon">{ICONS[r.icon]}</span>
            <strong>{r.label}</strong>
            <span className="muted">{r.text}</span>
          </button>
        ))}
      </div>
      {choice?.key === "anyone" && <AnyoneNext />}
      {choice && choice.key !== "anyone" && <CompanyNext key={choice.key} choice={choice} />}
    </section>
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

function HowItWorks() {
  return (
    <section className="home-card" aria-labelledby="how-title">
      <h2 id="how-title">How MediChain works</h2>
      <ol className="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="how-num">{i + 1}</span>
            <strong>{s.title}</strong>
            <p className="muted">{s.text}</p>
            {s.sigs && (
              <div className="how-sigs" aria-label="The three signatures">
                <span className="sig">1 Send</span>
                <span className="sig">2 Accept</span>
                <span className="sig">3 Approve</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function WhyTrust() {
  return (
    <section className="home-card" aria-labelledby="trust-title">
      <h2 id="trust-title">Why trust MediChain</h2>
      <ul className="trust-grid">
        {TRUST.map((t) => (
          <li key={t.title}>
            <span className="trust-icon">{ICONS[t.icon]}</span>
            <strong>{t.title}</strong>
            <span className="muted">{t.text}</span>
          </li>
        ))}
      </ul>
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
        <div className="home-ctas">
          <Link to="/ledger" className="btn btn-secondary">Explore the public ledger</Link>
        </div>
      </section>

      <RolePicker />
      <LiveStats />
      <HowItWorks />
      <WhyTrust />
    </div>
  );
}
