import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CONTRACT_ADDRESS, NETWORK, addressUrl } from "../../lib/contract";
import "./tour.css";

// Guided walkthrough for demos and first-time visitors: each step opens the page it describes
// and explains it in a callout at the bottom of the screen. The last step is the "try it" card.
const STEPS = [
  {
    path: "/",
    title: "Every hand-off, on the blockchain",
    text: "MediChain tracks medicine batches from manufacturer to distributor to pharmacy. Each step is a signed blockchain transaction, so a fake batch has no history to show.",
  },
  {
    path: "/verify/PCM-2026-001",
    title: "Anyone can verify a batch",
    text: "Scan the QR on the pack or type its ID. No wallet or login: the page reads the contract directly and shows GENUINE, RECALLED, EXPIRED or NOT FOUND.",
  },
  {
    path: "/verify/PCM-2026-001",
    title: "Three independent checks",
    text: "Scroll down: the browser recomputes the record, the 3 signatures on every hand-off, and the lab report's SHA-256 fingerprint from raw chain data.",
  },
  {
    path: "/dashboard",
    title: "3 signatures per hand-off",
    text: "Companies connect MetaMask. The sender initiates, the receiver accepts, the regulator approves. Custody moves only after all three, enforced by the smart contract.",
  },
  {
    path: "/ledger",
    title: "Everything lands on the public ledger",
    text: "Every creation, hand-off, approval and recall, with its block, transaction hash and signer. Nobody, not even the admin, can edit or delete it.",
  },
  {
    path: "/ledger/blocks",
    title: "Blocks chained by hash",
    text: "Each block stores the hash of the one before it. Changing any old entry would break every later link, so tampering is visible to everyone.",
  },
  {
    path: "/dashboard",
    title: "Admin controls, with limits",
    text: "The admin registers companies and can pause hand-offs in an emergency, but can't rewrite history, and recalls keep working even while paused.",
  },
  { outro: true },
];

const STORAGE_KEY = "medichain.tourStep";

export default function DemoTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved === null ? null : Number(saved);
    } catch {
      return null;
    }
  });

  // Remember the step across reloads in this tab, so a refresh doesn't end the tour.
  useEffect(() => {
    try {
      if (step === null) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, String(step));
    } catch {
      // storage blocked: the tour still works, it just won't survive a reload
    }
  }, [step]);

  const go = (i) => {
    setStep(i);
    const target = STEPS[i]?.path;
    if (target && location.pathname !== target) navigate(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (step === null) {
    return (
      <button type="button" className="tour-launch" onClick={() => go(0)}>
        ▶ Demo tour
      </button>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  if (current.outro) {
    const contractLink = addressUrl(CONTRACT_ADDRESS);
    return (
      <div className="tour-outro" role="dialog" aria-label="Try MediChain">
        <span className="tour-tag">Try MediChain</span>
        <ul>
          <li><span className="dot web" />alexm2025.github.io/TeamLungi</li>
          <li><span className="dot code" />github.com/Hack-On-Tracks-Floor-2/TeamLungi</li>
          {contractLink && (
            <li>
              <span className="dot chain" />
              <a href={contractLink} target="_blank" rel="noreferrer">
                Contract on {NETWORK.name} ↗
              </a>
            </li>
          )}
        </ul>
        <p className="tour-stack">Solidity · Hardhat · React · ethers.js · MetaMask · SHA-256 · {NETWORK.name}</p>
        <p className="tour-thanks">Thank you! · TeamLungi</p>
        <div className="tour-actions">
          <button type="button" onClick={() => go(step - 1)}>Back</button>
          <button type="button" className="primary" onClick={() => setStep(null)}>Finish</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tour-callout" role="dialog" aria-label={`Tour step ${step + 1}`}>
      <span className="tour-step">Step {step + 1}</span>
      <div className="tour-body">
        <strong>{current.title}</strong>
        <p>{current.text}</p>
      </div>
      <div className="tour-actions">
        <button type="button" onClick={() => setStep(null)} aria-label="Close tour">✕</button>
        {step > 0 && <button type="button" onClick={() => go(step - 1)}>Back</button>}
        <button type="button" className="primary" onClick={() => go(step + 1)}>
          {last ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
