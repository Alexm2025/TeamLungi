// Lab-report fingerprinting. The file never leaves the browser and never goes on-chain;
// only its SHA-256 hash is stored as the batch's docHash. Anyone holding the file can later
// re-hash it and compare: change one byte of the PDF and the hash no longer matches.
//
//   Manufacturer: const docHash = await hashFile(file);  ->  createBatch(..., docHash)
//   Verify page:  const r = await verifyDocument(batchId, file);  ->  r.matches
import { ZeroHash, hexlify, sha256 } from "ethers";
import { getContract } from "./contract";

// createBatch stores this when no lab report was attached.
export const NO_DOCUMENT = ZeroHash;

/** SHA-256 of a File/Blob/ArrayBuffer/Uint8Array as a 0x-prefixed bytes32 hex string. */
export async function hashFile(file) {
  const bytes =
    file instanceof Uint8Array
      ? file
      : new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());

  // Browser's built-in hashing is much faster for multi-MB PDFs; ethers is the fallback.
  if (globalThis.crypto?.subtle) {
    return hexlify(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  }
  return sha256(bytes);
}

/**
 * Compares a file against the docHash recorded on-chain for a batch.
 * Returns { matches, hasDocument, onChainHash, fileHash }.
 */
export async function verifyDocument(batchId, file) {
  const contract = await getContract();
  const [batch, fileHash] = await Promise.all([contract.getBatch(batchId), hashFile(file)]);
  const onChainHash = batch.docHash;
  const hasDocument = onChainHash !== NO_DOCUMENT;
  return {
    matches: hasDocument && onChainHash.toLowerCase() === fileHash.toLowerCase(),
    hasDocument,
    onChainHash,
    fileHash,
  };
}

/** Shortens a hash for display: 0x1234abcd…9f8e7d6c */
export const shortHash = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : "");
