import { Link } from "react-router-dom";

// Each box opens where that person works: companies go to their role's dashboard,
// everyone else to the Verify page.
const STEPS = [
  {
    who: "Manufacturer",
    what: "Registers a batch with its lab-report fingerprint, then signs step 1 of each hand-off.",
    to: "/dashboard?role=manufacturer",
    cta: "Open manufacturer dashboard",
  },
  {
    who: "Distributor",
    what: "Signs step 2 to confirm it physically received the batch, then sends it on.",
    to: "/dashboard?role=distributor",
    cta: "Open distributor dashboard",
  },
  {
    who: "Pharmacy",
    what: "Signs for the delivery; the full signed custody trail is now on record.",
    to: "/dashboard?role=pharmacy",
    cta: "Open pharmacy dashboard",
  },
  {
    who: "Regulator",
    what: "Countersigns every hand-off (step 3) and can recall any batch instantly.",
    to: "/dashboard?role=regulator",
    cta: "Open regulator dashboard",
  },
  {
    who: "Anyone",
    what: "Verifies a batch in 3 independent checks and browses the public ledger, no login needed.",
    to: "/verify",
    cta: "Verify a batch",
  },
];

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
          <li key={step.who}>
            <Link to={step.to} className="step">
              <span className="step-num">{i + 1}</span>
              <h3>{step.who}</h3>
              <p>{step.what}</p>
              <span className="step-cta">{step.cta} →</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
