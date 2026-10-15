// Demo stand-in for the deployed MedChain contract (read calls only).
// contractSource.js uses it only while no contract address is configured.
import { keccak256, toUtf8Bytes } from "ethers";

const ZERO = "0x0000000000000000000000000000000000000000";
const MFR = "0x1111111111111111111111111111111111111111";
const DIST = "0x2222222222222222222222222222222222222222";
const PHARM = "0x3333333333333333333333333333333333333333";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

// Same shape as the contract's participants(address) -> (role, name, location, active)
const PARTICIPANTS = {
  [MFR]: [1n, "Sunrise Pharma Ltd", "Ahmedabad, IN", true],
  [DIST]: [2n, "MedLink Distributors", "Mumbai, IN", true],
  [PHARM]: [3n, "CityCare Pharmacy", "Bengaluru, IN", true],
};

// Exact contents of docs/sample-lab-report-PCM-2026-001.txt. Dropping that file on the
// verify page for PCM-2026-001 shows "Authentic"; editing even one character makes it fail.
const SAMPLE_REPORT =
  "MediChain demo lab report\nBatch: PCM-2026-001\nDrug: Paracetamol 500mg\n" +
  "Manufacturer: Sunrise Pharma Ltd\nAssay: 99.2% (spec 95-105%)\nDissolution: pass\n" +
  "Microbial limits: pass\nResult: RELEASED\n";

const DOC_HASHES = {
  "PCM-2026-001": keccak256(toUtf8Bytes(SAMPLE_REPORT)),
  "AMX-2026-014": keccak256(toUtf8Bytes("a report you don't have")),
};

// Real contract returns BigInt for uint256, so the mock does too.
function batch(id, drugName, mfgDaysAgo, expiryDaysFromNow, quantity, owner, status) {
  return {
    batchId: id,
    drugName,
    manufacturer: MFR,
    mfgDate: BigInt(now - mfgDaysAgo * DAY),
    expiryDate: BigInt(now + expiryDaysFromNow * DAY),
    quantity: BigInt(quantity),
    docHash: DOC_HASHES[id] ?? "0x" + "0".repeat(64), // zero hash = no report registered
    currentOwner: owner,
    pendingReceiver: ZERO,
    status: BigInt(status),
    createdAt: BigInt(now - mfgDaysAgo * DAY),
    exists: true,
  };
}

const BATCHES = {
  "PCM-2026-001": batch("PCM-2026-001", "Paracetamol 500mg", 20, 700, 5000, PHARM, 3),
  "AMX-2026-014": batch("AMX-2026-014", "Amoxicillin 250mg", 40, 500, 2000, DIST, 4),
  "IBU-2024-007": batch("IBU-2024-007", "Ibuprofen 400mg", 800, -10, 3000, PHARM, 3),
};

const HISTORY = {
  "PCM-2026-001": [
    { from: ZERO, to: MFR, timestamp: BigInt(now - 20 * DAY), location: "Ahmedabad, IN" },
    { from: MFR, to: DIST, timestamp: BigInt(now - 15 * DAY), location: "Mumbai, IN" },
    { from: DIST, to: PHARM, timestamp: BigInt(now - 6 * DAY), location: "Bengaluru, IN" },
  ],
  "AMX-2026-014": [
    { from: ZERO, to: MFR, timestamp: BigInt(now - 40 * DAY), location: "Ahmedabad, IN" },
    { from: MFR, to: DIST, timestamp: BigInt(now - 30 * DAY), location: "Mumbai, IN" },
  ],
  "IBU-2024-007": [
    { from: ZERO, to: MFR, timestamp: BigInt(now - 800 * DAY), location: "Ahmedabad, IN" },
    { from: MFR, to: DIST, timestamp: BigInt(now - 790 * DAY), location: "Mumbai, IN" },
    { from: DIST, to: PHARM, timestamp: BigInt(now - 780 * DAY), location: "Bengaluru, IN" },
  ],
};

const RECALL_REASONS = {
  [keccak256(toUtf8Bytes("AMX-2026-014"))]: "Contamination found in quality re-test",
};

const delay = () => new Promise((r) => setTimeout(r, 300));

const mock = {
  async verifyBatch(id) {
    await delay();
    const b = BATCHES[id];
    if (!b) return [false, false, false, "", "", "", 0n];
    const holder = PARTICIPANTS[b.currentOwner][1];
    return [
      true,
      b.status === 4n,
      Number(b.expiryDate) < Math.floor(Date.now() / 1000),
      b.drugName,
      PARTICIPANTS[MFR][1],
      holder,
      BigInt(HISTORY[id].length - 1),
    ];
  },
  async getBatch(id) {
    await delay();
    if (!BATCHES[id]) throw new Error("Batch not found");
    return BATCHES[id];
  },
  async getHistory(id) {
    await delay();
    return HISTORY[id] ?? [];
  },
  async participants(address) {
    return PARTICIPANTS[address] ?? [0n, "", "", false];
  },
  async recallReason(key) {
    return RECALL_REASONS[key] ?? "";
  },
};

export async function getContract() {
  return mock;
}
