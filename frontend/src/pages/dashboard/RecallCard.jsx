import { useEffect, useState } from "react";
import { Alert, Button, Card, Input } from "../../components/ui";
import { canRecall } from "../../lib/recall";
import { friendlyError } from "./errors";
import { useTx } from "./useTx";
import { useWallet } from "./WalletContext";

const MAX_REASON = 200; // the reason is stored on-chain, and longer text costs more gas

// Regulator (any batch) or manufacturer (own batches): mark a batch as recalled.
// Recalling can't be undone, so the button asks for a second click to confirm.
export default function RecallCard({ batchId: initialId = "", lockId = false, onDone }) {
  const { account } = useWallet();
  const [batchId, setBatchId] = useState(initialId);
  const [reason, setReason] = useState("");
  const [check, setCheck] = useState({ allowed: false, why: "" });
  const [confirming, setConfirming] = useState(false);
  const [reasonError, setReasonError] = useState("");
  const { run, busy } = useTx();

  // Ask Member A's canRecall() whether this account may recall this batch, so we can
  // explain "why not" before MetaMask opens. Waits 400 ms after typing stops.
  useEffect(() => {
    const id = batchId.trim();
    setConfirming(false);
    setCheck({ allowed: false, why: "" });
    if (!id) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      canRecall(account, id)
        .then((result) => !cancelled && setCheck(result))
        .catch((err) => !cancelled && setCheck({ allowed: false, why: friendlyError(err) }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [account, batchId]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const id = batchId.trim();
    const why = reason.trim();
    if (!why) return setReasonError("Required: it is shown publicly on the verify page");
    setReasonError("");
    if (!confirming) return setConfirming(true);

    const receipt = await run(`Recall ${id}`, (c) => c.recallBatch(id, why));
    setConfirming(false);
    if (receipt) {
      setReason("");
      if (!lockId) setBatchId("");
      onDone?.();
    }
  };

  return (
    <Card
      title="Recall batch"
      subtitle="Flags the batch as unsafe for everyone who scans it. This can't be undone."
      className="card-danger"
    >
      <form onSubmit={onSubmit} noValidate>
        {!lockId && (
          <Input
            label="Batch ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="mono"
          />
        )}
        <Input
          label="Reason"
          value={reason}
          maxLength={MAX_REASON}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirming(false);
          }}
          placeholder="e.g. Contamination found in lab test"
          error={reasonError}
          hint={`${reason.length}/${MAX_REASON} characters, stored on-chain`}
        />
        {check.why && (
          <Alert type="info" className="mb">
            {check.why}
          </Alert>
        )}
        <div className="form-actions">
          <Button type="submit" variant="danger" loading={busy} disabled={!check.allowed}>
            {confirming ? "Click again to confirm recall" : "Recall batch"}
          </Button>
          {confirming && (
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
