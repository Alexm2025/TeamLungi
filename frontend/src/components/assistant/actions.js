// Blockchain reads and writes the assistant performs on the user's behalf.
import { ZeroAddress, getAddress, isAddress } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { ROLE, getContract, txUrl } from "../../lib/contract";
import { toUserMessage } from "../../lib/errors";
import { getPendingApprovals } from "../../lib/verification";

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Every registered participant, with their current on-chain role and status. */
export async function directory() {
  const latest = new Map();
  for (const e of await getAllEvents()) if (e.type === "ParticipantRegistered") latest.set(e.account.toLowerCase(), e.account);
  const c = await getContract();
  const people = await Promise.all(
    [...latest.values()].map(async (address) => {
      const p = await c.participants(address);
      return { address, name: p.name, location: p.location, role: Number(p.role), active: p.active };
    })
  );
  return people.filter((p) => p.role > 0);
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

/**
 * Finds the participant a user means: a wallet address, a company name ("FastMed"), or a role
 * ("the distributor"). Returns { match } or { options } (for the user to pick) or {}.
 */
export async function resolveParticipant(text, allowedRoles) {
  const people = (await directory()).filter((p) => p.active && (!allowedRoles || allowedRoles.includes(p.role)));
  const addr = text.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (addr && isAddress(addr)) {
    const hit = people.find((p) => same(p.address, addr));
    return hit ? { match: hit } : { unknownAddress: getAddress(addr) };
  }
  const q = words(text).filter((w) => !["the", "a", "an", "to", "please", "company", "send", "it"].includes(w));
  if (!q.length) return { options: people };
  const scored = people
    .map((p) => {
      const name = words(`${p.name} ${p.location}`);
      const roleWord = ROLE[p.role].toLowerCase();
      let score = 0;
      for (const w of q) {
        if (name.includes(w)) score += 3;
        else if (name.some((n) => n.startsWith(w) || w.startsWith(n))) score += 2;
        if (roleWord.startsWith(w.slice(0, 6))) score += 1;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { options: people };
  if (scored.length === 1 || scored[0].score > scored[1].score) return { match: scored[0].p };
  return { options: scored.filter((x) => x.score === scored[0].score).map((x) => x.p) };
}

export const describe = (p) => `${p.name || "Unnamed"} (${ROLE[p.role]}${p.location ? `, ${p.location}` : ""}, ${p.address.slice(0, 6)}…${p.address.slice(-4)})`;

/** Batches this account made, holds, or is about to receive (newest first). */
export async function myBatches(account) {
  const ids = new Set();
  for (const e of await getAllEvents()) {
    if (e.type === "BatchCreated" && same(e.by, account)) ids.add(e.batchId);
    if (["TransferInitiated", "TransferAccepted", "TransferApproved"].includes(e.type) && (same(e.from, account) || same(e.to, account))) ids.add(e.batchId);
  }
  const c = await getContract();
  const list = await Promise.all([...ids].map(async (id) => ({ id, b: await c.getBatch(id) })));
  return list
    .filter(({ b }) => same(b.currentOwner, account) || same(b.pendingReceiver, account) || same(b.manufacturer, account))
    .sort((x, y) => Number(y.b.createdAt) - Number(x.b.createdAt));
}

/** Batches waiting for this account to accept (signature 2). */
export async function incomingFor(account) {
  return (await myBatches(account)).filter(({ b }) => same(b.pendingReceiver, account) && !b.receiverAccepted);
}

export const pendingApprovals = () => getPendingApprovals();

/** Signs and sends a contract call: free dry-run first, then MetaMask, then waits for the block. */
export async function execute(method, args, onStage = () => {}) {
  try {
    const c = await getContract(true);
    await c[method].staticCall(...args); // fails here, for free, if the contract would refuse
    onStage("sign");
    const tx = await c[method](...args);
    onStage("mining", tx.hash);
    const receipt = await tx.wait();
    return { hash: tx.hash, block: receipt.blockNumber, url: txUrl(tx.hash) };
  } catch (err) {
    throw new Error(toUserMessage(err));
  }
}

/** Live summary of a batch, or null if it doesn't exist. */
export async function batchState(id) {
  const c = await getContract();
  const v = await c.verifyBatch(id);
  if (!v.exists) return null;
  const b = await c.getBatch(id);
  return { v, b, pending: b.pendingReceiver === ZeroAddress ? null : b.pendingReceiver };
}
