const STEPS = [
  { who: "Manufacturer", what: "Registers a batch: drug, dates, quantity and a document hash." },
  { who: "Distributor", what: "Accepts custody on-chain and moves the batch along." },
  { who: "Pharmacy", what: "Receives the batch; every hand-off is now on record." },
  { who: "Anyone", what: "Checks a batch's origin and custody trail on the Verify page." },
];

// Introduction only: getting to Verify or the Dashboard is done from the top menu.
export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Know where your medicine has been.</h1>
        <p>
          MediChain records every hand-off of a medicine batch on the blockchain, from
          manufacturer to pharmacy, so a fake batch has no history to show.
        </p>
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
