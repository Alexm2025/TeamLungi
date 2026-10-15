// Chooses where the verify page reads batches from.
// Until Member A deploys and VITE_CONTRACT_ADDRESS is set, the real wrapper points at
// the zero address, so we fall back to demo data instead of showing a network error.
import { ZeroAddress } from "ethers";
import { CONTRACT_ADDRESS, getContract as getRealContract } from "../../lib/contract";
import { hashFile, NO_DOCUMENT, verifyDocument as verifyOnChain } from "../../lib/document";
import { getContract as getMockContract } from "./mockContract";

export const USING_MOCK = CONTRACT_ADDRESS === ZeroAddress;

export const getContract = USING_MOCK ? getMockContract : () => getRealContract();

// Lab-report checks use Member A's SHA-256 helpers, the same ones the dashboard's
// Create batch form uses, so a certificate uploaded there verifies here.
export async function hasDocument(batchId) {
  const batch = await (await getContract()).getBatch(batchId);
  return batch.docHash !== NO_DOCUMENT;
}

// The file is hashed in the browser and never uploaded anywhere.
export async function verifyDocument(batchId, file) {
  if (!USING_MOCK) return (await verifyOnChain(batchId, file)).matches;
  const batch = await (await getContract()).getBatch(batchId);
  return (await hashFile(file)).toLowerCase() === batch.docHash.toLowerCase();
}
