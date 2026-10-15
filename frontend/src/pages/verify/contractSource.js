// Where the verify page reads batches from: always the live MediChain contract (lib/contract).
import { getContract as getRealContract, isContractConfigured } from "../../lib/contract";
import { NO_DOCUMENT, verifyDocument as verifyOnChain } from "../../lib/document";

export const CONTRACT_READY = isContractConfigured();
export const getContract = () => getRealContract();

export async function hasDocument(batchId) {
  const batch = await (await getContract()).getBatch(batchId);
  return batch.docHash !== NO_DOCUMENT;
}

// The file is hashed in the browser (SHA-256) and never uploaded anywhere.
export async function verifyDocument(batchId, file) {
  return (await verifyOnChain(batchId, file)).matches;
}
