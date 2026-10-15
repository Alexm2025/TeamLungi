// 3-layer verification of a batch. Each check is independent and recomputed from raw chain data in
// the browser, so a visitor doesn't have to trust our UI, only the blockchain.
//
//   const report = await verifyBatchFull("PCM-2026-001", optionalLabReportFile);
//   report.verdict            -> "verified" | "warning" | "failed" | "not_found"
//   report.checks[0..2]       -> { id, title, status: "pass"|"fail"|"warn"|"pending", summary, details[] }
//   report.handovers          -> each custody hop with its 3 signing transactions
import { ZeroAddress } from "ethers";
import { getContract, getProvider, ROLE } from "./contract";
import { getAllEvents } from "./activity";
import { hashFile, NO_DOCUMENT } from "./document";

const REGULATOR = 4;
const MANUFACTURER = 1;
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

const signerCache = new Map();
async function signerOf(txHash) {
  if (!signerCache.has(txHash)) signerCache.set(txHash, (await getProvider().getTransaction(txHash))?.from ?? null);
  return signerCache.get(txHash);
}

/**
 * Replays the batch's events in order and rebuilds every completed handover from its
 * three signed steps. Cancelled, rejected or recalled attempts reset the pending state.
 */
function rebuildHandovers(events) {
  const done = [];
  let pending = null;
  for (const e of events) {
    if (e.type === "TransferInitiated") pending = { from: e.from, to: e.to, initiated: e };
    else if (e.type === "TransferAccepted" && pending) pending.accepted = e;
    else if (e.type === "TransferApproved" && pending) {
      done.push({ ...pending, approved: e });
      pending = null;
    } else if (["TransferCancelled", "TransferRejected", "BatchRecalled"].includes(e.type)) pending = null;
  }
  return { done, pending };
}

export async function verifyBatchFull(batchId, file = null) {
  const contract = await getContract();
  const verdict = await contract.verifyBatch(batchId);
  if (!verdict.exists) {
    return {
      batchId,
      verdict: "not_found",
      checks: [
        { id: "record", title: "On-chain record", status: "fail", summary: "No batch with this ID exists on-chain.", details: [] },
      ],
      handovers: [],
    };
  }

  const [batch, history, allEvents] = await Promise.all([
    contract.getBatch(batchId),
    contract.getHistory(batchId),
    getAllEvents(),
  ]);
  const events = allEvents.filter((e) => e.batchId === batchId);
  const participantCache = new Map();
  const participant = async (addr) => {
    const key = addr.toLowerCase();
    if (!participantCache.has(key)) {
      const p = await contract.participants(addr);
      participantCache.set(key, { role: Number(p.role), name: p.name || short(addr), active: p.active });
    }
    return participantCache.get(key);
  };

  // ───────────── Check 1: the record itself ─────────────
  const record = { id: "record", title: "1. On-chain record", details: [] };
  {
    const maker = await participant(batch.manufacturer);
    const created = events.find((e) => e.type === "BatchCreated");
    const creatorSigner = created ? await signerOf(created.txHash) : null;

    const facts = [
      [true, `Batch exists in contract storage (created in block ${created?.blockNumber ?? "?"}).`],
      [maker.role === MANUFACTURER, `Created by ${maker.name}, registered as ${ROLE[maker.role]}.`],
      [same(creatorSigner, batch.manufacturer), `Creation transaction was signed by the manufacturer's own wallet ${short(creatorSigner)}.`],
      [!verdict.recalled, verdict.recalled ? "Batch has been RECALLED." : "Not recalled."],
      [!verdict.expired, verdict.expired ? "Batch is EXPIRED." : `Not expired (expires ${new Date(Number(batch.expiryDate) * 1000).toLocaleDateString()}).`],
    ];
    record.details = facts.map(([ok, text]) => ({ ok, text }));
    const integrityOk = facts.slice(0, 3).every(([ok]) => ok);
    record.status = !integrityOk || verdict.recalled ? "fail" : verdict.expired ? "warn" : "pass";
    record.summary = !integrityOk
      ? "Record failed integrity checks."
      : verdict.recalled
        ? "Genuine record, but the batch is recalled. Do not use."
        : verdict.expired
          ? "Genuine record, but past its expiry date."
          : "Genuine, active and in date.";
  }

  // ───────────── Check 2: every custody hop carries 3 valid signatures ─────────────
  const custody = { id: "custody", title: "2. Custody chain (3 signatures per handover)", details: [] };
  const { done, pending } = rebuildHandovers(events);
  const handovers = [];
  {
    const hops = history.slice(1); // entry 0 is creation
    let allOk = hops.length === done.length;
    if (!allOk) {
      custody.details.push({
        ok: false,
        text: `Stored history has ${hops.length} handovers but the event log proves ${done.length}.`,
      });
    }

    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];
      const proof = done[i];
      const [fromP, toP] = await Promise.all([participant(hop.from), participant(hop.to)]);
      const steps = [];
      let ok = !!proof && same(proof.from, hop.from) && same(proof.to, hop.to);

      if (proof) {
        const [s1, s2, s3] = await Promise.all([
          signerOf(proof.initiated.txHash),
          proof.accepted ? signerOf(proof.accepted.txHash) : null,
          signerOf(proof.approved.txHash),
        ]);
        const regulator = s3 ? await participant(s3) : null;
        steps.push(
          { step: 1, label: "Sender initiated", signer: s1, ok: same(s1, hop.from), txHash: proof.initiated.txHash, blockNumber: proof.initiated.blockNumber },
          { step: 2, label: "Receiver accepted", signer: s2, ok: same(s2, hop.to), txHash: proof.accepted?.txHash, blockNumber: proof.accepted?.blockNumber },
          { step: 3, label: "Regulator approved", signer: s3, ok: regulator?.role === REGULATOR && same(s3, hop.approvedBy), txHash: proof.approved.txHash, blockNumber: proof.approved.blockNumber }
        );
        ok = ok && steps.every((s) => s.ok);
      }
      // Each hop must start where the previous one ended.
      const prevTo = i === 0 ? history[0].to : hops[i - 1].to;
      const continuous = same(hop.from, prevTo);
      ok = ok && continuous;
      allOk = allOk && ok;

      handovers.push({ index: i + 1, from: hop.from, to: hop.to, fromName: fromP.name, toName: toP.name, location: hop.location, timestamp: Number(hop.timestamp), ok, continuous, steps });
      custody.details.push({
        ok,
        text: `Handover ${i + 1}: ${fromP.name} → ${toP.name}${ok ? " (3/3 signatures valid)" : " (signature check FAILED)"}`,
      });
    }

    const currentOk = same(batch.currentOwner, hops.length ? hops[hops.length - 1].to : batch.manufacturer);
    if (!currentOk) custody.details.push({ ok: false, text: "Current owner does not match the end of the custody chain." });
    allOk = allOk && currentOk;

    if (pending) {
      const stage = pending.accepted ? "accepted by receiver, awaiting regulator (2/3)" : "initiated, awaiting receiver (1/3)";
      custody.details.push({ ok: true, text: `In-progress handover to ${short(pending.to)}: ${stage}.` });
    }

    custody.status = allOk ? "pass" : "fail";
    custody.summary = allOk
      ? hops.length === 0
        ? "Still with the manufacturer; no handovers yet."
        : `All ${hops.length} handover(s) signed by sender, receiver and regulator.`
      : "Custody chain could not be fully proven.";
  }

  // ───────────── Check 3: lab report fingerprint ─────────────
  const document = { id: "document", title: "3. Lab report fingerprint (SHA-256)", details: [] };
  {
    const registered = batch.docHash !== NO_DOCUMENT;
    if (!registered) {
      document.status = "warn";
      document.summary = "No lab report was registered for this batch.";
    } else if (!file) {
      document.status = "pending";
      document.summary = "A report fingerprint is registered. Upload the PDF to compare.";
      document.details.push({ ok: true, text: `Registered fingerprint: ${batch.docHash}` });
    } else {
      const fileHash = await hashFile(file);
      const match = fileHash.toLowerCase() === batch.docHash.toLowerCase();
      document.status = match ? "pass" : "fail";
      document.summary = match ? "Uploaded report matches the registered fingerprint exactly." : "Uploaded report does NOT match. It may be altered or fake.";
      document.details.push(
        { ok: true, text: `Registered: ${batch.docHash}` },
        { ok: match, text: `Uploaded:   ${fileHash}` }
      );
    }
  }

  const checks = [record, custody, document];
  // "pending" (report not uploaded yet) doesn't lower the verdict: most customers won't have the PDF.
  const overall = checks.some((c) => c.status === "fail")
    ? "failed"
    : checks.some((c) => c.status === "warn")
      ? "warning"
      : "verified";

  return { batchId, verdict: overall, checks, handovers, currentOwner: batch.currentOwner, manufacturer: batch.manufacturer, pendingReceiver: batch.pendingReceiver === ZeroAddress ? null : batch.pendingReceiver };
}

/** Batches waiting for the regulator's signature (step 3), oldest first. */
export async function getPendingApprovals() {
  const events = await getAllEvents();
  const byBatch = new Map();
  for (const e of events) if (e.batchId) byBatch.set(e.batchId, [...(byBatch.get(e.batchId) ?? []), e]);

  const result = [];
  for (const [batchId, list] of byBatch) {
    const { pending } = rebuildHandovers(list);
    if (pending?.accepted) {
      result.push({ batchId, from: pending.from, to: pending.to, acceptedAt: pending.accepted.blockNumber, initiatedTx: pending.initiated.txHash, acceptedTx: pending.accepted.txHash });
    }
  }
  return result.sort((a, b) => a.acceptedAt - b.acceptedAt);
}
