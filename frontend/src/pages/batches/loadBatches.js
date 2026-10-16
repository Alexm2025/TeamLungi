// Loads every batch a manufacturer created, with its live state, read straight from the contract.
import { ZeroAddress, ZeroHash } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { getContract } from "../../lib/contract";

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const DAY = 86400;
export const EXPIRING_DAYS = 30;

/** Status buckets shown as filters and overview cards (a batch can be in one bucket). */
export const BUCKETS = {
  all: "All batches",
  with_you: "With you",
  in_transit: "In transit",
  awaiting: "Awaiting approval",
  at_distributor: "At distributor",
  at_pharmacy: "At pharmacy",
  recalled: "Recalled",
  expired: "Expired",
};

function bucketOf(b, me, nowSec) {
  const status = Number(b.status);
  if (status === 4) return "recalled";
  if (Number(b.expiryDate) < nowSec) return "expired";
  if (status === 5) return "awaiting";
  if (status === 1) return "in_transit";
  if (same(b.currentOwner, me)) return "with_you";
  if (status === 3) return "at_pharmacy";
  return "at_distributor";
}

export async function loadManufacturerBatches(account) {
  const c = await getContract();
  const nowSec = Math.floor(Date.now() / 1000);

  // Every BatchCreated by this wallet, confirmed against the batch's stored manufacturer.
  const created = (await getAllEvents()).filter((e) => e.type === "BatchCreated" && same(e.by, account));
  const rows = await Promise.all(
    created.map(async (e) => {
      const [b, history] = await Promise.all([c.getBatch(e.batchId), c.getHistory(e.batchId)]);
      return { e, b, history };
    })
  );
  const mine = rows.filter(({ b }) => same(b.manufacturer, account));

  // Participant names for holders and every stop on the way.
  const addrs = new Set();
  for (const { b, history } of mine) {
    addrs.add(b.currentOwner);
    if (b.pendingReceiver !== ZeroAddress) addrs.add(b.pendingReceiver);
    history.forEach((h) => addrs.add(h.to));
  }
  const people = new Map(
    await Promise.all(
      [...addrs].map(async (a) => {
        const p = await c.participants(a);
        return [a.toLowerCase(), { name: p.name || `${a.slice(0, 6)}…${a.slice(-4)}`, role: Number(p.role) }];
      })
    )
  );
  const who = (a) => people.get(a?.toLowerCase()) ?? { name: "", role: 0 };

  return mine
    .map(({ e, b, history }) => {
      const expiry = Number(b.expiryDate);
      const bucket = bucketOf(b, account, nowSec);
      const pending = b.pendingReceiver === ZeroAddress ? null : b.pendingReceiver;
      // Which supply-chain stages the batch has reached: 1 manufacturer, 2 distributor, 3 pharmacy.
      const reached = new Set(history.map((h) => who(h.to).role));
      return {
        batchId: b.batchId,
        drugName: b.drugName,
        quantity: Number(b.quantity),
        mfgDate: Number(b.mfgDate),
        createdAt: Number(b.createdAt),
        expiry,
        daysToExpiry: Math.ceil((expiry - nowSec) / DAY),
        status: Number(b.status),
        bucket,
        holder: who(b.currentOwner).name,
        holderAddress: b.currentOwner,
        pendingTo: pending ? who(pending).name : null,
        handoffs: history.length - 1,
        stages: { distributor: reached.has(2), pharmacy: reached.has(3) },
        hasReport: b.docHash !== ZeroHash,
        docHash: b.docHash,
        createdBlock: e.blockNumber,
        createdTx: e.txHash,
      };
    })
    .sort((x, y) => y.createdAt - x.createdAt);
}

export function toCsv(rows) {
  const cols = ["Batch ID", "Drug", "Quantity", "Manufactured", "Expiry", "Status", "Current holder", "Hand-offs", "Lab report fingerprint", "Creation tx"];
  const date = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.batchId, r.drugName, r.quantity, date(r.mfgDate), date(r.expiry), BUCKETS[r.bucket], r.holder, r.handoffs, r.hasReport ? r.docHash : "", r.createdTx].map(esc).join(",")
  );
  return [cols.map(esc).join(","), ...lines].join("\n");
}
