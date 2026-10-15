import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import { ROLE, STATUS } from "../../lib/contract";
import { getContract, USING_MOCK } from "./contractSource";
import QRScanner from "../../components/qr/QRScanner";
import "./verify.css";

const VERDICTS = {
  genuine: { title: "GENUINE", text: "This batch is registered on-chain and safe to sell." },
  recalled: { title: "RECALLED", text: "Do not use. This batch has been recalled." },
  expired: { title: "EXPIRED", text: "This batch is past its expiry date." },
  notfound: { title: "NOT FOUND", text: "No batch with this ID exists on-chain. It may be counterfeit." },
};

// Contract dates are unix seconds as BigInt; JS Date wants milliseconds.
const formatDate = (secs) => new Date(Number(secs) * 1000).toLocaleDateString();
const formatDateTime = (secs) => new Date(Number(secs) * 1000).toLocaleString();
const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function loadBatch(batchId) {
  const contract = await getContract();
  const [exists, recalled, expired, drugName, manufacturerName, currentHolder] =
    await contract.verifyBatch(batchId);

  if (!exists) return { verdict: "notfound" };

  const [batch, history] = await Promise.all([
    contract.getBatch(batchId),
    contract.getHistory(batchId),
  ]);

  // Resolve each distinct address in the history to a participant name once.
  const addresses = [...new Set(history.flatMap((h) => [h.from, h.to]))].filter(
    (a) => a !== ZeroAddress
  );
  const people = {};
  await Promise.all(
    addresses.map(async (addr) => {
      const [role, name, location] = await contract.participants(addr);
      people[addr] = { role: ROLE[Number(role)], name: name || shortAddr(addr), location };
    })
  );

  // The recall reason is stored under keccak256(batchId) rather than the plain string.
  const reason = recalled ? await contract.recallReason(keccak256(toUtf8Bytes(batchId))) : "";

  return {
    verdict: recalled ? "recalled" : expired ? "expired" : "genuine",
    reason,
    details: {
      drugName,
      manufacturerName,
      currentHolder,
      mfgDate: batch.mfgDate,
      expiryDate: batch.expiryDate,
      quantity: Number(batch.quantity),
      status: STATUS[Number(batch.status)],
    },
    timeline: history.map((h) => ({
      created: h.from === ZeroAddress,
      from: people[h.from],
      to: people[h.to],
      location: h.location,
      timestamp: h.timestamp,
    })),
  };
}

export default function VerifyPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(batchId ?? "");
  const [state, setState] = useState({ loading: false, error: "", result: null });
  const [scanning, setScanning] = useState(false);
  const closeScanner = useCallback(() => setScanning(false), []);

  // The URL is the source of truth: searching navigates, and this effect loads.
  // That way a scanned QR link and a typed ID behave exactly the same.
  useEffect(() => {
    if (!batchId) return;
    setInput(batchId);
    let cancelled = false;
    setState({ loading: true, error: "", result: null });
    loadBatch(batchId)
      .then((result) => !cancelled && setState({ loading: false, error: "", result }))
      .catch((err) => {
        console.error(err);
        if (!cancelled)
          setState({ loading: false, error: "Could not reach the blockchain. Please try again.", result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const onSubmit = (e) => {
    e.preventDefault();
    const id = input.trim();
    if (id) navigate(`/verify/${encodeURIComponent(id)}`);
  };

  const { loading, error, result } = state;

  return (
    <main className="verify">
      <h1>Verify a medicine batch</h1>
      <p className="verify-sub">Enter the batch ID printed on the pack, or scan its QR code.</p>
      {USING_MOCK && (
        <p className="verify-demo">
          Demo mode: contract not deployed yet. Try PCM-2026-001, AMX-2026-014 or IBU-2024-007.
        </p>
      )}

      <form className="verify-search" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. PCM-2026-001"
          aria-label="Batch ID"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? "Checking…" : "Verify"}
        </button>
        <button type="button" onClick={() => setScanning((s) => !s)}>
          {scanning ? "Close scanner" : "Scan QR"}
        </button>
      </form>

      {scanning && <QRScanner onClose={closeScanner} />}

      {error && <p className="verify-error">{error}</p>}

      {result && (
        <>
          <section className={`verdict verdict-${result.verdict}`}>
            <h2>{VERDICTS[result.verdict].title}</h2>
            <p>{VERDICTS[result.verdict].text}</p>
            {result.reason && <p className="verdict-reason">Reason: {result.reason}</p>}
          </section>

          {result.details && (
            <section className="verify-card">
              <h3>Batch details</h3>
              <dl className="verify-details">
                <dt>Drug</dt><dd>{result.details.drugName}</dd>
                <dt>Manufacturer</dt><dd>{result.details.manufacturerName}</dd>
                <dt>Current holder</dt><dd>{result.details.currentHolder}</dd>
                <dt>Status</dt><dd>{result.details.status}</dd>
                <dt>Manufactured</dt><dd>{formatDate(result.details.mfgDate)}</dd>
                <dt>Expires</dt><dd>{formatDate(result.details.expiryDate)}</dd>
                <dt>Quantity</dt><dd>{result.details.quantity.toLocaleString()} units</dd>
              </dl>
            </section>
          )}

          {result.timeline?.length > 0 && (
            <section className="verify-card">
              <h3>Custody history</h3>
              <ol className="timeline">
                {result.timeline.map((step, i) => (
                  <li key={i}>
                    <strong>
                      {step.created
                        ? `Manufactured by ${step.to.name}`
                        : `${step.from.name} → ${step.to.name}`}
                    </strong>
                    <span>
                      {step.to.role} · {step.location}
                    </span>
                    <time>{formatDateTime(step.timestamp)}</time>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </main>
  );
}
