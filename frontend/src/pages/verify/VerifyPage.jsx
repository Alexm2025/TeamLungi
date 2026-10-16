import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import { ROLE, STATUS } from "../../lib/contract";
import { CONTRACT_READY, getContract } from "./contractSource";
import ThreeStepVerification from "../../components/ledger/ThreeStepVerification.jsx";
import QRScanner from "../../components/qr/QRScanner";
import LabReportCheck from "./LabReportCheck";
import TransactionsView from "../ledger/TransactionsView.jsx";
import "../../components/ledger/ledger.css";
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
  // Bumped when something changes on-chain from this tab (e.g. the assistant sent this batch),
  // so the page re-reads the batch even though the URL stayed the same.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("medichain:changed", bump);
    return () => window.removeEventListener("medichain:changed", bump);
  }, []);

  // Arriving from a clicked batch ID elsewhere: start at the verdict, not halfway down the page.
  useEffect(() => {
    if (batchId) window.scrollTo({ top: 0 });
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    setInput(batchId);
    let cancelled = false;
    // A refresh of the same batch keeps the old result on screen until the new one arrives.
    setState((s) => (version > 0 && s.result ? { ...s, loading: true } : { loading: true, error: "", result: null }));
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
  }, [batchId, version]);

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
      {!CONTRACT_READY && (
        <p className="verify-error">
          This build is not connected to a MediChain contract, so batches can't be checked yet.
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

          {result.details && <LabReportCheck key={batchId} batchId={batchId} />}

          {result.details && (
            <section className="verify-card">
              <h3>Full 3-step verification</h3>
              <p className="verify-sub">
                Recomputed in your browser from raw blockchain data: the record, every handover's 3 signatures,
                and the lab report fingerprint.
              </p>
              <ThreeStepVerification key={`${batchId}-${version}`} batchId={batchId} />
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

          {result.details && (
            <div className="verify-tx">
              <TransactionsView key={`${batchId}-${version}`} batchId={batchId} compact />
            </div>
          )}
        </>
      )}
    </main>
  );
}
