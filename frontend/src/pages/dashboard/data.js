// Read helpers for the dashboard: turn contract structs into plain objects and
// work out which batches belong to an account. Everything is read from the live contract.
import { ZeroAddress, ZeroHash } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { getRecalledBatches } from "../../lib/recall";
import { getReadContract } from "./chain";
import { sameAddress } from "./format";

// ---------- converting contract results ----------

// ethers returns structs as array-like Results with BigInt numbers; the UI wants plain values.
export function toParticipant(p) {
  return {
    role: Number(p.role),
    name: p.name,
    location: p.location,
    active: Boolean(p.active),
  };
}

export function toBatch(b) {
  return {
    batchId: b.batchId,
    drugName: b.drugName,
    manufacturer: b.manufacturer,
    mfgDate: Number(b.mfgDate),
    expiryDate: Number(b.expiryDate),
    quantity: b.quantity.toString(),
    docHash: b.docHash === ZeroHash ? null : b.docHash,
    currentOwner: b.currentOwner,
    pendingReceiver: b.pendingReceiver === ZeroAddress ? null : b.pendingReceiver,
    receiverAccepted: Boolean(b.receiverAccepted),
    status: Number(b.status),
    createdAt: Number(b.createdAt),
  };
}

export async function fetchParticipants(addresses) {
  const c = await getReadContract();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const entries = await Promise.all(unique.map(async (a) => [a, toParticipant(await c.participants(a))]));
  return Object.fromEntries(entries); // keyed by lower-case address
}

// ---------- batch IDs this browser has seen ----------
// A backup for when a public RPC limits event searches.

const KNOWN_KEY = "medichain.knownBatches";

function knownBatchIds() {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_KEY) || "[]");
  } catch {
    return [];
  }
}

export function rememberBatch(batchId) {
  try {
    const ids = new Set(knownBatchIds());
    ids.add(batchId);
    localStorage.setItem(KNOWN_KEY, JSON.stringify([...ids]));
  } catch {
    // storage blocked: the batch can still be found through events
  }
}

// ---------- finding "my" batches through events ----------

const PARTY_EVENTS = ["TransferInitiated", "TransferAccepted", "TransferApproved"];

// IDs of batches this account appears in as maker, sender or receiver (from the shared,
// cached event history in lib/activity, which scans from the deploy block in safe chunks).
async function batchIdsFromEvents(account) {
  const ids = new Set();
  for (const e of await getAllEvents()) {
    const involved =
      (e.type === "BatchCreated" && sameAddress(e.by, account)) ||
      (PARTY_EVENTS.includes(e.type) && (sameAddress(e.from, account) || sameAddress(e.to, account)));
    if (involved) ids.add(e.batchId);
  }
  return ids;
}

const newestFirst = (a, b) => b.createdAt - a.createdAt;

// Batches this account made, holds, is about to receive, or has passed on; newest first.
export async function loadMyBatches(account) {
  let fromEvents = new Set();
  let eventsFailed = false;
  try {
    fromEvents = await batchIdsFromEvents(account);
  } catch (err) {
    console.warn("Event search failed; showing batches remembered in this browser.", err);
    eventsFailed = true;
  }

  const c = await getReadContract();
  const ids = [...new Set([...fromEvents, ...knownBatchIds()])];
  const results = await Promise.allSettled(ids.map((batchId) => c.getBatch(batchId)));
  const batches = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => toBatch(r.value))
    // Remembered IDs can include batches this browser only looked at, so those
    // are kept only if this account is part of them right now.
    .filter(
      (b) =>
        fromEvents.has(b.batchId) ||
        sameAddress(b.manufacturer, account) ||
        sameAddress(b.currentOwner, account) ||
        sameAddress(b.pendingReceiver, account)
    )
    .sort(newestFirst);
  return { batches, eventsFailed };
}

// Every recall, newest first: [{ batchId, reason, by, timestamp, txHash }] from BatchRecalled events.
export const loadRecalls = () => getRecalledBatches();
