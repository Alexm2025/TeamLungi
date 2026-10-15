// Step 3 of the handover, for the regulator's approval queue.
//   const list = await getPendingApprovals();          // from verification.js
//   await approveTransfer(batchId);                    // custody moves
//   await rejectTransfer(batchId, "Invoice mismatch"); // batch stays with the sender
import { getContract } from "./contract";
import { toUserMessage } from "./errors";

export { getPendingApprovals } from "./verification";

// Dry-run first (free), so a call the contract would refuse fails before the user pays gas.
async function send(method, ...args) {
  try {
    const contract = await getContract(true);
    await contract[method].staticCall(...args);
    const tx = await contract[method](...args);
    return await tx.wait();
  } catch (err) {
    throw new Error(toUserMessage(err));
  }
}

export const approveTransfer = (batchId) => send("approveTransfer", batchId.trim());

export function rejectTransfer(batchId, reason) {
  if (!reason?.trim()) throw new Error("Enter a reason. It is stored on-chain with the rejection.");
  return send("rejectTransfer", batchId.trim(), reason.trim());
}
