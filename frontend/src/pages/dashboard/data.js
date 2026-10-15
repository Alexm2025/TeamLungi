// Read helpers for the dashboard: turn contract structs into plain objects and
// work out which batches belong to an account.
import { ZeroAddress, ZeroHash, id as hashText } from "ethers";
import { CONTRACT_ADDRESS, getContract, getProvider } from "./chain";
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
    status: Number(b.status),
    createdAt: Number(b.createdAt),
  };
}

export async function fetchParticipants(addresses) {
  const c = await getContract();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const entries = await Promise.all(
    unique.map(async (a) => [a, toParticipant(await c.participants(a))])
  );
  return Object.fromEntries(entries); // keyed by lower-case address
}

// Batch details + custody history + recall reason, for the detail page.
export async function fetchBatch(batchId) {
  const c = await getContract();
  const [raw, history] = await Promise.all([c.getBatch(batchId), c.getHistory(batchId)]);
  const batch = toBatch(raw);
  // The contract keys its mappings by keccak256(batchId); ethers' id() computes exactly that
  batch.recallReason = batch.status === 4 ? await c.recallReason(hashText(batchId)) : "";
  const handovers = history.map((h) => ({
    from: h.from,
    to: h.to,
    timestamp: Number(h.timestamp),
    location: h.location,
  }));
  return { batch, handovers };
}

// ---------- batch IDs this browser has seen ----------
// The contract can't list batches by owner, so we find them from events (below).
// This local list is a backup for when the public RPC limits event searches.

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

// Amoy makes a block about every 2 s, so 150k blocks ≈ 3.5 days: the whole hackathon.
// Set VITE_DEPLOY_BLOCK in frontend/.env to start exactly at the deployment instead.
const LOOKBACK_BLOCKS = 150_000;
const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || 0);
const CHUNK = 10_000; // many public RPCs refuse log searches wider than this
const PARALLEL = 5; // chunks fetched at once, to stay under rate limits

// Every event the contract emitted recently. One log search per block range covers
// all event types at once, instead of a search per event type.
async function recentEvents() {
  const provider = getProvider();
  const c = await getContract();
  const latest = await provider.getBlockNumber();
  const floor = Math.max(DEPLOY_BLOCK, latest - LOOKBACK_BLOCKS, 0);

  const ranges = [];
  for (let to = latest; to >= floor; to -= CHUNK) {
    ranges.push({ fromBlock: Math.max(floor, to - CHUNK + 1), toBlock: to });
  }

  const logs = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const part = await Promise.all(
      ranges
        .slice(i, i + PARALLEL)
        .map((range) => provider.getLogs({ address: CONTRACT_ADDRESS, ...range }))
    );
    logs.push(...part.flat());
  }
  return logs.map((log) => c.interface.parseLog(log)).filter(Boolean);
}

async function findBatchIds(account) {
  const ids = new Set(knownBatchIds());
  let eventsFailed = false;
  try {
    for (const { name, args } of await recentEvents()) {
      const mine =
        (name === "BatchCreated" && sameAddress(args.manufacturer, account)) ||
        ((name === "TransferInitiated" || name === "TransferAccepted") &&
          (sameAddress(args.from, account) || sameAddress(args.to, account)));
      if (mine) ids.add(args.batchId);
    }
  } catch (err) {
    console.warn("Event search failed; showing batches remembered in this browser.", err);
    eventsFailed = true;
  }
  return { ids: [...ids], eventsFailed };
}

// Batches this account made, holds now, or is about to receive, newest first.
export async function loadMyBatches(account) {
  const { ids, eventsFailed } = await findBatchIds(account);
  const c = await getContract();
  const results = await Promise.allSettled(ids.map((batchId) => c.getBatch(batchId)));
  const batches = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => toBatch(r.value))
    .filter(
      (b) =>
        sameAddress(b.manufacturer, account) ||
        sameAddress(b.currentOwner, account) ||
        sameAddress(b.pendingReceiver, account)
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return { batches, eventsFailed };
}
