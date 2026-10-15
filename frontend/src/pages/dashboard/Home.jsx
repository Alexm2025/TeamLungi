import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTRACT_ADDRESS, NETWORK, ROLE, addressUrl, isContractConfigured } from "../../lib/contract";
import { getChainOverview } from "../../lib/ledger";
import { shortAddress } from "./format";
import { ROLE_OPTIONS, useWallet } from "./WalletContext";
import "./home.css";

// Thin line icons on a 24px grid.
const PATHS = {
  manufacturer: "M3 21V10l5 3V10l5 3V7l8 4v10H3Zm4-4h2m4 0h2",
  distributor: "M2 7h11v9H2zM13 10h4l4 3v3h-8M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  pharmacy: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  regulator: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  key: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7Z",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
};

const Icon = ({ name, className = "mc-icon" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

const ROLE_COPY = {
  manufacturer: "Register batches and start hand-offs",
  distributor: "Confirm receipt and move stock onward",
  pharmacy: "Receive verified stock for dispensing",
  regulator: "Approve hand-offs and issue recalls",
};

function VerifyForm() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (id.trim()) navigate(`/verify/${encodeURIComponent(id.trim())}`);
  };
  return (
    <form className="mc-verify" onSubmit={submit}>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter a batch ID, e.g. PCM-2026-001" aria-label="Batch ID" />
      <button type="submit" disabled={!id.trim()}>
        Verify <Icon name="arrow" className="mc-icon-sm" />
      </button>
    </form>
  );
}

// Pick a role, connect MetaMask, and go to that role's dashboard. While signed in, only that
// role is shown here, until the user logs out (which also disconnects the site in MetaMask).
function SignInCard() {
  const navigate = useNavigate();
  const { signedIn, sessionRole, account, participant, isAdmin, connecting, error, signIn, signOut } = useWallet();
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState("");
  const hasWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  if (signedIn) {
    const label = ROLE_OPTIONS[sessionRole]?.label ?? ROLE[participant.role];
    return (
      <aside className="mc-card mc-signin">
        <p className="mc-kicker">Signed in</p>
        <div className="mc-session">
          <span className="mc-session-icon"><Icon name={sessionRole} /></span>
          <div>
            <strong>{label}{isAdmin ? " · Admin" : ""}</strong>
            <span>{participant.name || "Registered participant"}{participant.location ? `, ${participant.location}` : ""}</span>
            <code>{shortAddress(account)}</code>
          </div>
        </div>
        <Link to="/dashboard" className="mc-btn mc-btn-primary">
          Open {label} dashboard <Icon name="arrow" className="mc-icon-sm" />
        </Link>
        <button type="button" className="mc-btn mc-btn-ghost" onClick={signOut}>
          Log out and disconnect wallet
        </button>
        <p className="mc-fine">Other roles stay hidden until you log out. Then sign in with that role's MetaMask account.</p>
      </aside>
    );
  }

  const go = async () => {
    if (!selected) {
      setHint("Choose your role first.");
      return;
    }
    setHint("");
    if (await signIn(selected)) navigate("/dashboard");
  };

  return (
    <aside className="mc-card mc-signin">
      <p className="mc-kicker">Participant sign-in</p>
      <h2>Choose your role</h2>
      <div className="mc-roles" role="radiogroup" aria-label="Role">
        {Object.entries(ROLE_OPTIONS).map(([key, opt]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected === key}
            className={`mc-role${selected === key ? " is-on" : ""}`}
            onClick={() => {
              setSelected(key);
              setHint("");
            }}
          >
            <span className="mc-role-icon"><Icon name={key} /></span>
            <span className="mc-role-text">
              <strong>{opt.label}</strong>
              <span>{ROLE_COPY[key]}</span>
            </span>
            <span className="mc-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      {hasWallet ? (
        <button type="button" className="mc-btn mc-btn-primary" disabled={connecting} onClick={go}>
          {connecting ? "Check MetaMask to continue…" : selected ? `Connect MetaMask as ${ROLE_OPTIONS[selected].label}` : "Connect MetaMask"}
        </button>
      ) : (
        <a className="mc-btn mc-btn-primary" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install MetaMask to sign in
        </a>
      )}
      {(hint || error) && <p className="mc-error" role="alert">{hint || error}</p>}
      <p className="mc-fine">The smart contract checks that your wallet is registered for the selected role.</p>
    </aside>
  );
}

function Stats() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isContractConfigured()) return;
    const load = () => getChainOverview().then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const url = addressUrl(CONTRACT_ADDRESS);
  return (
    <section className="mc-stats" aria-label="Network status">
      <div><span>Batches on-chain</span><strong>{info?.totalBatches ?? "—"}</strong></div>
      <div><span>Signed transactions</span><strong>{info?.totalTransactions ?? "—"}</strong></div>
      <div><span>Latest block</span><strong>{info ? `#${info.latestBlock.toLocaleString()}` : "—"}</strong></div>
      <div>
        <span>Smart contract</span>
        {url ? <a href={url} target="_blank" rel="noreferrer">{shortAddress(CONTRACT_ADDRESS)} ↗</a> : <strong>—</strong>}
      </div>
    </section>
  );
}

const STEPS = [
  ["Manufacturer", "Registers the batch with its lab-report fingerprint."],
  ["Distributor", "Confirms receipt and moves the batch onward."],
  ["Pharmacy", "Final custodian before the patient."],
];

const ASSURANCE = [
  ["lock", "Immutable", "Written to a public blockchain. No one, including the operators, can alter or delete an entry."],
  ["key", "Signed", "Every action carries the participant's MetaMask signature, verified by the network."],
  ["doc", "Rule-bound", "Roles, routes, approvals and recalls are enforced by the smart contract itself."],
  ["eye", "Open", "Anyone can verify a batch from its QR code. No account, wallet or fee."],
];

export default function Home() {
  return (
    <div className="mc">
      <section className="mc-hero">
        <div className="mc-hero-copy">
          <p className="mc-badge"><span className="mc-dot" /> Live on {NETWORK.name}</p>
          <h1>
            Medicine you can <span className="mc-grad">trace</span>, from factory to pharmacy.
          </h1>
          <p className="mc-lead">
            MediChain records every custody hand-off of a medicine batch on the blockchain. Each transfer is
            countersigned by the sender, the receiver and the regulator, and anyone can verify it.
          </p>
          <VerifyForm />
          <p className="mc-fine">Public verification. No wallet or login required.</p>
        </div>
        <SignInCard />
      </section>

      <Stats />

      <section className="mc-section">
        <div className="mc-section-head">
          <p className="mc-kicker">Custody protocol</p>
          <h2>Three signatures on every hand-off</h2>
          <p className="mc-sub">Custody moves only after the sender initiates, the receiver confirms receipt and the regulator approves.</p>
        </div>
        <ol className="mc-steps">
          {STEPS.map(([who, what], i) => (
            <li key={who}>
              <span className="mc-step-no">0{i + 1}</span>
              <strong>{who}</strong>
              <p>{what}</p>
              {i < STEPS.length - 1 && (
                <div className="mc-handoff">
                  <span>Sender</span><span>Receiver</span><span>Regulator</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mc-section">
        <div className="mc-section-head">
          <p className="mc-kicker">Assurance</p>
          <h2>Built so the record can be trusted</h2>
        </div>
        <ul className="mc-assure">
          {ASSURANCE.map(([icon, title, text]) => (
            <li key={title}>
              <span className="mc-assure-icon"><Icon name={icon} /></span>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
