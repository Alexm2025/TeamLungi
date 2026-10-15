import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input } from "../../components/ui";
import ThreeStepVerification from "../../components/ledger/ThreeStepVerification.jsx";
import TransactionsView from "./TransactionsView.jsx";

// Track one batch: the 3-layer verification report plus every transaction that touched it.
export default function TrackBatch() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(batchId ?? "");

  const go = (e) => {
    e.preventDefault();
    if (input.trim()) navigate(`/ledger/batch/${encodeURIComponent(input.trim())}`);
  };

  return (
    <div className="ledger-stack">
      <Card title="Track and verify a batch" subtitle="Runs 3 independent checks against the blockchain, right here in your browser.">
        <form className="ledger-filters" onSubmit={go}>
          <Input label="Batch ID" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. PCM-2026-001" />
          <Button type="submit">Verify</Button>
        </form>
      </Card>
      {batchId && (
        <>
          <ThreeStepVerification batchId={batchId} />
          <TransactionsView batchId={batchId} />
        </>
      )}
    </div>
  );
}
