// Recall logic for the regulator page.
//
//   const { allowed, why } = await canRecall(account, batchId);   // enable/disable the button
//   const receipt = await recallBatch(batchId, reason);           // MetaMask popup, waits for mining
//   const { recalled, reason } = await getRecallInfo(batchId);
//   const list = await getRecalledBatches();                       // table of all recalls
import { keccak256, toUtf8Bytes } from "ethers";
import { getContract } from "./contract";
import { getActivity } from "./activity";
import { toUserMessage } from "./errors";

const REGULATOR = 4; // Role.Regulator in MedChain.sol

// The contract keys recallReason by keccak256(batchId), the same key it uses for batches.
const batchKey = (batchId) => keccak256(toUtf8Bytes(batchId));

/**
 * Mirrors the contract's recall rules so the UI can explain *why* before the user signs:
 * the regulator, or the manufacturer of this batch, may recall a batch that isn't already recalled.
 */
export async function canRecall(account, batchId) {
  if (!account) return { allowed: false, why: "Connect your wallet first." };
  const contract = await getContract();

  const verdict = await contract.verifyBatch(batchId);
  if (!verdict.exists) return { allowed: false, why: "Batch not found." };
  if (verdict.recalled) return { allowed: false, why: "Batch is already recalled." };

  const [participant, batch] = await Promise.all([contract.participants(account), contract.getBatch(batchId)]);
  const isRegulator = participant.active && Number(participant.role) === REGULATOR;
  const isManufacturer = batch.manufacturer.toLowerCase() === account.toLowerCase();
  if (!isRegulator && !isManufacturer) {
    return { allowed: false, why: "Only the regulator or this batch's manufacturer can recall it." };
  }
  return { allowed: true, why: "" };
}

/**
 * Recalls a batch and waits for the transaction to be mined.
 * Throws an Error with a readable message on failure.
 */
export async function recallBatch(batchId, reason) {
  const id = batchId?.trim();
  const why = reason?.trim();
  if (!id) throw new Error("Enter a batch ID.");
  if (!why) throw new Error("Enter a recall reason. It is stored on-chain and shown to the public.");

  try {
    const contract = await getContract(true);
    // Dry-run first: a doomed call fails here with the contract's reason,
    // instead of after the user has already paid gas.
    await contract.recallBatch.staticCall(id, why);
    const tx = await contract.recallBatch(id, why);
    return await tx.wait();
  } catch (err) {
    throw new Error(toUserMessage(err));
  }
}

export async function getRecallInfo(batchId) {
  const contract = await getContract();
  const verdict = await contract.verifyBatch(batchId);
  if (!verdict.exists || !verdict.recalled) return { recalled: false, reason: "" };
  return { recalled: true, reason: await contract.recallReason(batchKey(batchId)) };
}

/** All recalls, newest first: [{ batchId, reason, by, timestamp, txHash }] */
export async function getRecalledBatches() {
  const items = await getActivity({ limit: Infinity });
  return items
    .filter((i) => i.type === "BatchRecalled")
    .map(({ batchId, reason, by, timestamp, txHash }) => ({ batchId, reason, by, timestamp, txHash }));
}