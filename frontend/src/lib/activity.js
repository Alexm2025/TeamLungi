// Activity feed built from MedChain contract events (the on-chain audit log).
//
//   const items = await getActivity({ limit: 20 });            // latest events, newest first
//   const items = await getActivity({ batchId: "PCM-2026-001" }); // one batch only
//   const stop = subscribeActivity((item) => setFeed((f) => [item, ...f]));  // live updates
//   ...later: stop();
//
// Each item: { type, label, batchId, from, to, by, account, reason, drugName, role, name,
//              blockNumber, txHash, timestamp (unix seconds) }
import { DEPLOY_BLOCK, getContract, getProvider, ROLE } from "./contract";

// The public Amoy RPC rejects log queries spanning more than 10,000 blocks.
const MAX_BLOCK_RANGE = 9_000;

const LABELS = {
  ParticipantRegistered: "Participant registered",
  ParticipantDeactivated: "Participant deactivated",
  BatchCreated: "Batch created",
  TransferInitiated: "Transfer started",
  TransferAccepted: "Transfer accepted",
  TransferCancelled: "Transfer cancelled",
  BatchRecalled: "Batch recalled",
};

const blockTimeCache = new Map();

async function blockTimestamp(blockNumber) {
  if (!blockTimeCache.has(blockNumber)) {
    const block = await getProvider().getBlock(blockNumber);
    blockTimeCache.set(blockNumber, block ? block.timestamp : null);
  }
  return blockTimeCache.get(blockNumber);
}

// Turns an ethers EventLog into a plain object the UI can render directly.
function toItem(log) {
  const type = log.eventName ?? log.fragment?.name;
  const a = log.args;
  const item = {
    type,
    label: LABELS[type] ?? type,
    blockNumber: log.blockNumber,
    logIndex: log.index,
    txHash: log.transactionHash,
  };

  switch (type) {
    case "ParticipantRegistered":
      return { ...item, account: a.account, role: ROLE[Number(a.role)], name: a.name };
    case "ParticipantDeactivated":
      return { ...item, account: a.account };
    case "BatchCreated":
      return { ...item, batchId: a.batchId, drugName: a.drugName, by: a.manufacturer };
    case "TransferInitiated":
    case "TransferAccepted":
      return { ...item, batchId: a.batchId, from: a.from, to: a.to };
    case "TransferCancelled":
      return { ...item, batchId: a.batchId, by: a.by };
    case "BatchRecalled":
      return { ...item, batchId: a.batchId, reason: a.reason, by: a.by };
    default:
      return item;
  }
}

/**
 * Reads past events from the deploy block to now, newest first.
 * batchId filters to one batch; limit caps the number of items returned.
 */
export async function getActivity({ batchId, limit = 50, fromBlock = DEPLOY_BLOCK } = {}) {
  const contract = await getContract();
  const latest = await getProvider().getBlockNumber();
  const logs = [];

  // Walk the range in chunks the RPC accepts. All event types come back in one query per chunk.
  for (let start = fromBlock; start <= latest; start += MAX_BLOCK_RANGE + 1) {
    const end = Math.min(start + MAX_BLOCK_RANGE, latest);
    logs.push(...(await contract.queryFilter("*", start, end)));
  }

  // batchId is a plain (non-indexed) string in the events, so filter here rather than in the RPC query.
  let items = logs.filter((l) => l.eventName).map(toItem);
  if (batchId) items = items.filter((i) => i.batchId === batchId);
  items.sort((x, y) => y.blockNumber - x.blockNumber || y.logIndex - x.logIndex);
  items = items.slice(0, limit);

  await Promise.all(items.map(async (i) => (i.timestamp = await blockTimestamp(i.blockNumber))));
  return items;
}

/**
 * Calls onEvent(item) for each new contract event mined after subscribing (oldest first).
 * Returns a function that stops listening (call it in a React effect cleanup).
 *
 * Polls for new blocks instead of using contract.on(): ethers' listeners can replay
 * old events, and many public RPCs don't support the filter calls they rely on.
 */
export function subscribeActivity(onEvent, { batchId, intervalMs = 4000 } = {}) {
  let stopped = false;
  let timer;

  (async () => {
    const contract = await getContract();
    let lastSeen = await getProvider().getBlockNumber();

    const poll = async () => {
      if (stopped) return;
      try {
        const latest = await getProvider().getBlockNumber();
        if (latest > lastSeen) {
          // Cap the range so a long pause (e.g. a sleeping laptop) never exceeds the RPC limit.
          const from = Math.max(lastSeen + 1, latest - MAX_BLOCK_RANGE);
          const logs = await contract.queryFilter("*", from, latest);
          lastSeen = latest;
          for (const log of logs) {
            if (!log.eventName) continue;
            const item = toItem(log);
            if (batchId && item.batchId !== batchId) continue;
            item.timestamp = await blockTimestamp(item.blockNumber);
            if (!stopped) onEvent(item);
          }
        }
      } catch (err) {
        console.warn("Activity poll failed, retrying:", err.shortMessage ?? err.message);
      }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };
    timer = setTimeout(poll, intervalMs);
  })();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
