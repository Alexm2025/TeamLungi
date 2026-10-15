import { useState } from "react";
import { Button, Card, Input } from "../../components/ui";
import { hashFile, NO_DOCUMENT } from "../../lib/document";
import { rememberBatch } from "./data";
import { dateInputToUnix } from "./format";
import { useTx } from "./useTx";

// Local calendar date as YYYY-MM-DD (toISOString alone would give the UTC date,
// which is "yesterday" in India before 5:30 AM)
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

// e.g. MED-20261015-K3F9: readable, sortable by date, and unlikely to clash
function newBatchId() {
  const date = today().replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MED-${date}-${suffix}`;
}

const emptyForm = () => ({
  batchId: newBatchId(),
  drugName: "",
  mfgDate: today(),
  expiryDate: "",
  quantity: "",
});

// Manufacturer only: register a new batch on-chain.
export default function CreateBatch({ onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // changing it remounts the file input, clearing it
  const [errors, setErrors] = useState({});
  const { run, busy } = useTx();

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const validate = () => {
    const problems = {};
    if (!form.batchId.trim()) problems.batchId = "Required";
    if (!form.drugName.trim()) problems.drugName = "Required";
    if (!form.mfgDate) problems.mfgDate = "Required";
    if (!form.expiryDate) problems.expiryDate = "Required";
    else if (form.mfgDate && form.expiryDate <= form.mfgDate) {
      problems.expiryDate = "Must be after the manufacturing date";
    }
    if (!/^\d+$/.test(form.quantity) || BigInt(form.quantity) === 0n) {
      problems.quantity = "Whole number above 0";
    }
    setErrors(problems);
    return Object.keys(problems).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const batchId = form.batchId.trim();

    // Only the certificate's fingerprint (SHA-256) goes on-chain: anyone holding the file can
    // hash it again on the verify page and compare, but the file itself stays private.
    // Uses Member A's hashFile() so the verify page computes exactly the same fingerprint.
    const docHash = file ? await hashFile(file) : NO_DOCUMENT;

    const receipt = await run(`Create batch ${batchId}`, (c) =>
      c.createBatch(
        batchId,
        form.drugName.trim(),
        dateInputToUnix(form.mfgDate),
        dateInputToUnix(form.expiryDate),
        BigInt(form.quantity),
        docHash
      )
    );
    if (receipt) {
      rememberBatch(batchId);
      setForm(emptyForm());
      setFile(null);
      setFileKey((k) => k + 1);
      onCreated?.(batchId);
    }
  };

  return (
    <Card title="Create batch" subtitle="Register a new medicine batch on the blockchain.">
      <form onSubmit={onSubmit} noValidate>
        <div className="form-row">
          <Input
            label="Batch ID"
            value={form.batchId}
            onChange={set("batchId")}
            error={errors.batchId}
            hint="Printed on the pack and in the QR code"
            className="mono"
          />
          <Input
            label="Drug name"
            value={form.drugName}
            onChange={set("drugName")}
            error={errors.drugName}
            placeholder="Paracetamol 500 mg"
          />
        </div>
        <div className="form-row">
          <Input
            type="date"
            label="Manufactured"
            value={form.mfgDate}
            max={today()}
            onChange={set("mfgDate")}
            error={errors.mfgDate}
          />
          <Input
            type="date"
            label="Expires"
            value={form.expiryDate}
            min={form.mfgDate || undefined}
            onChange={set("expiryDate")}
            error={errors.expiryDate}
          />
        </div>
        <div className="form-row">
          <Input
            type="number"
            label="Quantity (units)"
            min="1"
            step="1"
            value={form.quantity}
            onChange={set("quantity")}
            error={errors.quantity}
          />
          <Input
            key={fileKey}
            type="file"
            label="Quality certificate (optional)"
            hint="Only its fingerprint (hash) is stored"
            onChange={(e) => setFile(e.target.files[0] ?? null)}
          />
        </div>
        <Button type="submit" loading={busy}>
          Create batch
        </Button>
      </form>
    </Card>
  );
}
