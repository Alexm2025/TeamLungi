// Chooses where the verify page reads batches from.
// Until Member A deploys and VITE_CONTRACT_ADDRESS is set, the real wrapper points at
// the zero address, so we fall back to demo data instead of showing a network error.
import { keccak256, ZeroAddress, ZeroHash } from "ethers";
import * as lib from "../../lib/contract";
import { getContract as getMockContract } from "./mockContract";

export const USING_MOCK = lib.CONTRACT_ADDRESS === ZeroAddress;

export const getContract = USING_MOCK ? getMockContract : () => lib.getContract();

// Lab-report checks. If Member A's lib provides verifyDocument / hasDocument we use those;
// otherwise these local versions do the same thing against the batch's on-chain docHash.
async function localHasDocument(batchId) {
  const batch = await (await getContract()).getBatch(batchId);
  return batch.docHash !== ZeroHash;
}

// Hash the file's raw bytes in the browser and compare with the hash stored on-chain.
// The file itself never leaves the user's device.
async function localVerifyDocument(batchId, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const batch = await (await getContract()).getBatch(batchId);
  return keccak256(bytes) === batch.docHash;
}

// Copy into a plain object so the bundler doesn't warn while these exports don't exist yet.
const libFns = { ...lib };
const useLib = !USING_MOCK && typeof libFns.verifyDocument === "function";

export const hasDocument = useLib && libFns.hasDocument ? libFns.hasDocument : localHasDocument;
export const verifyDocument = useLib ? libFns.verifyDocument : localVerifyDocument;
