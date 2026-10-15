import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Card, Spinner } from "../ui";
import { verifyBatchFull } from "../../lib/verification";
import HashLink from "./HashLink.jsx";
import { dateTime, short } from "./format";
import "./ledger.css";

const VERDICT = {
  verified: { tone: "green", title: "VERIFIED", text: "All three independent checks passed." },
  warning: { tone: "amber", title: "CHECK WARNINGS", text: "The record is genuine, but read the warnings below." },
  failed: { tone: "red", title: "VERIFICATION FAILED", text: "Do not trust this batch. See which check failed." },
  not_found: { tone: "red", title: "NOT FOUND", text: "No batch with this ID exists on-chain. It may be counterfeit." },
};
const STATUS_TONE = { pass: "green", fail: "red", warn: "amber", pending: "neutral" };
const STATUS_TEXT = { pass: "PASS", fail: "FAIL", warn: "WARNING", pending: "AWAITING FILE" };

/**
 * Full 3-layer verification for one batch, computed in the browser from raw chain data:
 *   1. the on-chain record, 2. every custody hop's 3 signatures, 3. the lab-report fingerprint.
 * Drop-in usage: <ThreeStepVerification batchId="PCM-2026-001" />
 */
export default function ThreeStepVerification({ batchId }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const inputRef = useRef(null);

  const run = useCallback(
    async (withFile) => {
      setLoading(true);
      setError("");
      try {
        setReport(await verifyBatchFull(batchId, withFile));
      } catch (err) {
        setError(err.shortMessage || err.message);
      } finally {
        setLoading(false);
      }
    },
    [batchId]
  );

  useEffect(() => {
    setFile(null);
    run(null);
  }, [run]);

  const onFile = (f) => {
    if (!f) return;
    setFile(f);
    run(f);
  };

  if (loading && !report) return <Spinner label="Verifying against the blockchain…" />;
  if (error) return <Alert type="error" title="Couldn't verify">{error}</Alert>;
  if (!report) return null;

  const v = VERDICT[report.verdict];
  return (
    <div className="tsv">
      <div className={`tsv-verdict tsv-${v.tone}`}>
        <strong>{v.title}</strong>
        <span>{v.text}</span>
        {loading && <Spinner size="sm" />}
      </div>

      <div className="tsv-checks">
        {report.checks.map((c) => (
          <Card key={c.id} title={c.title} actions={<Badge tone={STATUS_TONE[c.status]}>{STATUS_TEXT[c.status]}</Badge>}>
            <p>{c.summary}</p>
            <ul className="tsv-details">
              {c.details.map((d, i) => (
                <li key={i} className={d.ok ? "ok" : "bad"}>
                  <span aria-hidden="true">{d.ok ? "✓" : "✗"}</span> <span className="mono-wrap">{d.text}</span>
                </li>
              ))}
            </ul>
            {c.id === "document" && c.status !== "warn" && (
              <div
                className="tsv-drop"
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files[0]);
                }}
              >
                {file ? `Checked: ${file.name}. Drop another file to re-check.` : "Drop the lab report here, or click to choose. It never leaves your browser."}
                <input ref={inputRef} type="file" hidden onChange={(e) => onFile(e.target.files[0])} />
              </div>
            )}
          </Card>
        ))}
      </div>

      {report.handovers.length > 0 && (
        <Card title="Custody chain: who signed each step" subtitle="Each handover needs the sender, the receiver and the regulator to sign.">
          <ol className="tsv-hops">
            {report.handovers.map((h) => (
              <li key={h.index} className={h.ok ? "ok" : "bad"}>
                <div className="tsv-hop-head">
                  <strong>
                    {h.index}. {h.fromName} → {h.toName}
                  </strong>
                  <span className="muted">
                    {h.location} · {dateTime(h.timestamp)}
                  </span>
                  <Badge tone={h.ok ? "green" : "red"}>{h.ok ? "3/3 signatures" : "INVALID"}</Badge>
                </div>
                <ul className="tsv-steps">
                  {h.steps.map((s) => (
                    <li key={s.step} className={s.ok ? "ok" : "bad"}>
                      <span aria-hidden="true">{s.ok ? "✓" : "✗"}</span> Step {s.step}: {s.label} by{" "}
                      <HashLink kind="address" value={s.signer} /> in block <HashLink kind="block" value={s.blockNumber} />, tx{" "}
                      <HashLink kind="tx" value={s.txHash} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {report.pendingReceiver && (
        <p className="muted">
          A handover to {short(report.pendingReceiver)} is in progress (see the custody check above).
        </p>
      )}
    </div>
  );
}
