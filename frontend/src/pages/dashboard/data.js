// Read helpers for the dashboard: turn contract structs into plain objects and
// work out which batches belong to an account.
import { ZeroAddress, ZeroHash, id as hashText } from "ethers";
import { getRecalledBatches } from "../../lib/recall";
import {
  CONTRACT_ADDRESS,
  DEMO_MODE,
  DEPLOY_BLOCK,
  getContract,
  getProvider,
  getReadContract,
} from "./chain";
import { DEMO_ACCOUNTS, DEMO_BATCH_IDS } from "./demo";
import { sameAddress } from "./format";

// ---------- converting contract results ----------

// ethers returns structs as array-like Results with BigInt numbers; the UI wants plain values.
// Fields are read by name, falling back to position (the preview's sample data uses plain arrays).
export function toParticipant(p) {
  return {
    role: Number(p.role ?? p[0]),
    name: p.name ?? p[1],
    location: p.location ?? p[2],
    active: Boolean(p.active ?? p[3]),
  };
}

const demoAccount = (address) =>
  Object.values(DEMO_ACCOUNTS).find((a) => sameAddress(a.address, address));

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
  const c = await getReadContract();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const entries = await Promise.all(
    unique.map(async (a) => {
      const sample = DEMO_MODE && demoAccount(a);
      return [a, sample ? sample.participant : toParticipant(await c.participants(a))];
    })
  );
  return Object.fromEntries(entries); // keyed by lower-case address
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

// Search starts at the deploy block (VITE_DEPLOY_BLOCK, via Member A's lib). If that isn't
// set, look back 150k blocks: Amoy makes one about every 2 s, so ≈ 3.5 days, the whole hackathon.
const LOOKBACK_BLOCKS = 150_000;
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

// IDs of batches this account appears in as maker, sender or receiver.
async function batchIdsFromEvents(account) {
  const ids = new Set();
  for (const { name, args } of await recentEvents()) {
    const involved =
      (name === "BatchCreated" && sameAddress(args.manufacturer, account)) ||
      ((name === "TransferInitiated" || name === "TransferAccepted") &&
        (sameAddress(args.from, account) || sameAddress(args.to, account)));
    if (involved) ids.add(args.batchId);
  }
  return ids;
}

const newestFirst = (a, b) => b.createdAt - a.createdAt;

// Preview mode: the sample batches this sample account appears in anywhere along the way.
async function loadDemoBatches(account) {
  const c = await getReadContract();
  const rows = await Promise.all(
    DEMO_BATCH_IDS.map(async (id) => ({
      batch: toBatch(await c.getBatch(id)),
      history: await c.getHistory(id),
    }))
  );
  const batches = rows
    .filter(
      ({ batch, history }) =>
        sameAddress(batch.manufacturer, account) ||
        sameAddress(batch.currentOwner, account) ||
        history.some((h) => sameAddress(h.from, account) || sameAddress(h.to, account))
    )
    .map((r) => r.batch)
    .sort(newestFirst);
  return { batches, eventsFailed: false };
}

// Batches this account made, holds, is about to receive, or has passed on; newest first.
export async function loadMyBatches(account) {
  if (DEMO_MODE) return loadDemoBatches(account);
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

// Every recall, newest first: [{ batchId, reason, by, timestamp, txHash }].
// Live: Member A's getRecalledBatches() (from events). Preview: the recalled sample batches,
// which have no transaction behind them, so timestamp and txHash are empty.
export async function loadRecalls() {
  if (!DEMO_MODE) return getRecalledBatches();
  const c = await getReadContract();
  const recalled = [];
  for (const id of DEMO_BATCH_IDS) {
    if (toBatch(await c.getBatch(id)).status !== 4) continue;
    recalled.push({
      batchId: id,
      // The contract keys recallReason by keccak256(batchId); ethers' id() computes exactly that
      reason: await c.recallReason(hashText(id)),
      by: DEMO_ACCOUNTS.regulator.address,
      timestamp: null,
      txHash: null,
    });
  }
  return recalled;
}
