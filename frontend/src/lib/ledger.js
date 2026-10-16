// Public ledger / block explorer data. Everything here is read straight from the chain through the
// public RPC: no backend, no database, so anyone can reproduce what the page shows.
//
//   const rows = await getLedger({ batchId, address, type });  // every transaction, newest first (+ batch expiry)
//   const tx = await getTransactionDetails(hash);               // receipt, signer, gas, decoded call + events
//   const block = await getBlockDetails(number);                // header: hash, parent hash, miner, gas
//   const blocks = await getLedgerBlocks();                     // blocks that hold MedChain txs, linked by hash
//   const info = await getChainOverview();                      // network, latest block, contract stats
import { formatEther, Interface } from "ethers";
import { ABI, CHAIN_ID, CONTRACT_ADDRESS, DEPLOY_BLOCK, NETWORK, getContract, getProvider } from "./contract";
import { blockTimestamp, getAllEvents } from "./activity";

const iface = new Interface(ABI);
const txCache = new Map(); // hash -> transaction (immutable once mined, safe to cache forever)
const blockCache = new Map(); // number -> block header
const expiryCache = new Map(); // batchId -> expiry (unix seconds); the contract never changes it

async function getTx(hash) {
  if (!txCache.has(hash)) txCache.set(hash, await getProvider().getTransaction(hash));
  return txCache.get(hash);
}

async function getBlockHeader(number) {
  if (!blockCache.has(number)) blockCache.set(number, await getProvider().getBlock(number));
  return blockCache.get(number);
}

/** Which function call a transaction made, e.g. { name: "approveTransfer", args: { batchId: "…" } }. */
function decodeCall(tx) {
  try {
    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
    if (!parsed) return null;
    const args = {};
    parsed.fragment.inputs.forEach((input, i) => (args[input.name] = formatValue(parsed.args[i])));
    return { name: parsed.name, signature: parsed.signature, args };
  } catch {
    return null; // e.g. the contract-creation transaction
  }
}

const formatValue = (v) => (typeof v === "bigint" ? v.toString() : v);

// Events don't carry the expiry date, so read it from the batch record once per batch.
async function batchExpiries(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !expiryCache.has(id));
  if (missing.length) {
    const c = await getContract();
    await Promise.all(
      missing.map(async (id) => {
        try {
          expiryCache.set(id, Number((await c.getBatch(id)).expiryDate));
        } catch {
          expiryCache.set(id, null); // reverted: no such batch
        }
      })
    );
  }
  return expiryCache;
}

/**
 * Every contract event as a ledger row, newest first, with the wallet that signed its transaction.
 * Filters: batchId, address (any party or signer), type (event name).
 */
export async function getLedger({ batchId, address, type, limit = 500 } = {}) {
  let rows = await getAllEvents();
  if (batchId) rows = rows.filter((r) => r.batchId === batchId);
  if (type) rows = rows.filter((r) => r.type === type);
  rows = rows.slice().sort((x, y) => y.blockNumber - x.blockNumber || y.logIndex - x.logIndex);

  // The signer is the tx's `from`: the wallet whose private key authorised this entry.
  const withSigner = await Promise.all(
    rows.map(async (r) => {
      const tx = await getTx(r.txHash);
      return { ...r, signer: tx?.from ?? null, timestamp: await blockTimestamp(r.blockNumber) };
    })
  );

  const result = address
    ? withSigner.filter((r) =>
        [r.signer, r.from, r.to, r.by, r.account].some((a) => a && a.toLowerCase() === address.toLowerCase())
      )
    : withSigner;
  const page = result.slice(0, limit);
  const expiries = await batchExpiries(page.map((r) => r.batchId));
  return page.map((r) => (r.batchId ? { ...r, expiryDate: expiries.get(r.batchId) ?? null } : r));
}

/** Full detail for one transaction: what was called, who signed, which block, what it cost, what it emitted. */
export async function getTransactionDetails(hash) {
  const provider = getProvider();
  const [tx, receipt, latest] = await Promise.all([
    getTx(hash),
    provider.getTransactionReceipt(hash),
    provider.getBlockNumber(),
  ]);
  if (!tx) return null;

  const block = receipt ? await getBlockHeader(receipt.blockNumber) : null;
  const gasPrice = receipt?.gasPrice ?? tx.gasPrice ?? 0n;
  const events = (receipt?.logs ?? [])
    .filter((log) => log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase())
    .map((log) => {
      try {
        const parsed = iface.parseLog(log);
        const args = {};
        parsed.fragment.inputs.forEach((input, i) => (args[input.name] = formatValue(parsed.args[i])));
        return { name: parsed.name, args, logIndex: log.index };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    hash,
    status: receipt ? (receipt.status === 1 ? "success" : "failed") : "pending",
    from: tx.from,
    to: tx.to,
    nonce: tx.nonce,
    blockNumber: receipt?.blockNumber ?? null,
    blockHash: receipt?.blockHash ?? null,
    timestamp: block?.timestamp ?? null,
    confirmations: receipt ? latest - receipt.blockNumber + 1 : 0,
    gasUsed: receipt?.gasUsed?.toString() ?? null,
    gasPriceGwei: Number(gasPrice) / 1e9,
    fee: receipt ? `${formatEther(receipt.gasUsed * gasPrice)} ${NETWORK.symbol}` : null,
    call: decodeCall(tx),
    events,
    // The ECDSA signature (v, r, s) is what proves `from` authorised this transaction.
    signature: tx.signature ? { r: tx.signature.r, s: tx.signature.s, v: tx.signature.v } : null,
  };
}

/** Header of one block. */
export async function getBlockDetails(number) {
  const block = await getBlockHeader(Number(number));
  if (!block) return null;
  const ours = (await getAllEvents()).filter((e) => e.blockNumber === block.number);
  return {
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    miner: block.miner,
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    txCount: block.transactions.length,
    medchainTxs: [...new Set(ours.map((e) => e.txHash))],
    medchainEvents: ours,
  };
}

/**
 * The blocks that contain MedChain transactions, newest first. Each carries its parentHash,
 * so the UI can show how every block is cryptographically chained to the one before it.
 */
export async function getLedgerBlocks({ limit = 30 } = {}) {
  const events = await getAllEvents();
  const numbers = [...new Set(events.map((e) => e.blockNumber))].sort((a, b) => b - a).slice(0, limit);
  const blocks = await Promise.all(numbers.map((n) => getBlockHeader(n)));
  return blocks.filter(Boolean).map((b) => ({
    number: b.number,
    hash: b.hash,
    parentHash: b.parentHash,
    timestamp: b.timestamp,
    txCount: b.transactions.length,
    events: events.filter((e) => e.blockNumber === b.number),
  }));
}

/** Network and contract summary for the explorer header. */
export async function getChainOverview() {
  const provider = getProvider();
  const contract = await getContract();
  const [latestBlock, totalBatches, events] = await Promise.all([
    provider.getBlockNumber(),
    contract.totalBatches(),
    getAllEvents(),
  ]);
  return {
    network: NETWORK.name,
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_ADDRESS,
    deployBlock: DEPLOY_BLOCK,
    latestBlock,
    totalBatches: Number(totalBatches),
    totalEvents: events.length,
    totalTransactions: new Set(events.map((e) => e.txHash)).size,
  };
}
