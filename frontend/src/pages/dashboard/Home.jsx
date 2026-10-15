import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const STEPS = [
  { who: "Manufacturer", what: "Registers a batch: drug, dates, quantity and a document hash." },
  { who: "Distributor", what: "Accepts custody on-chain and moves the batch along." },
  { who: "Pharmacy", what: "Receives the batch; every hand-off is now on record." },
  { who: "Anyone", what: "Enters a batch ID to check its origin and custody trail." },
];

export default function Home() {
  const [batchId, setBatchId] = useState("");
  const navigate = useNavigate();

  const onVerify = (e) => {
    e.preventDefault();
    const id = batchId.trim();
    if (id) navigate(`/verify/${encodeURIComponent(id)}`);
  };

  return (
    <div className="home">
      <section className="hero">
        <h1>Know where your medicine has been.</h1>
        <p>
          MediChain records every hand-off of a medicine batch on the blockchain, from
          manufacturer to pharmacy, so a fake batch has no history to show.
        </p>
        <form className="hero-verify" onSubmit={onVerify}>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="Enter a batch ID"
            aria-label="Batch ID"
          />
          <button className="btn btn-primary" type="submit">
            Verify
          </button>
        </form>
        <Link to="/dashboard" className="hero-link">
          Supply-chain partner? Open your dashboard →
        </Link>
      </section>

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.who} className="step">
            <span className="step-num">{i + 1}</span>
            <h3>{step.who}</h3>
            <p>{step.what}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
