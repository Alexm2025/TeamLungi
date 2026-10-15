// Builds the notification list for the signed-in role from live chain data.
// Every item: { id, severity, title, detail, block, href, cta, batchId }
//   severity: "critical" (act now, safety) | "action" (needs you) | "warning" | "success" | "info"
import { ZeroAddress } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { ROLE, getContract } from "../../lib/contract";
import { getPendingApprovals } from "../../lib/verification";

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const DAY = 86400;
const EXPIRY_WARNING_DAYS = 30;
const RECENT_EVENTS = 60; // how far back "news" items go, in relevant events

let nameCache = new Map();
async function namesFor(addresses) {
  const c = await getContract();
  const missing = [...new Set(addresses.filter((a) => a && a !== ZeroAddress && !nameCache.has(a.toLowerCase())))];
  await Promise.all(
    missing.map(async (a) => {
      const p = await c.participants(a);
      nameCache.set(a.toLowerCase(), p.name || short(a));
    })
  );
  return (a) => (a ? nameCache.get(a.toLowerCase()) ?? short(a) : "");
}

export const SEVERITY_ORDER = { critical: 0, action: 1, warning: 2, success: 3, info: 4 };

/** Public visitors: recent recalls, so anyone sees safety alerts. */
async function publicAlerts(events) {
  return events
    .filter((e) => e.type === "BatchRecalled")
    .slice(-5)
    .reverse()
    .map((e) => ({
      id: `recall:${e.txHash}`,
      severity: "warning",
      title: `${e.batchId} has been recalled`,
      detail: `Reason: "${e.reason}". Check any pack with this batch ID.`,
      block: e.blockNumber,
      href: `/verify/${encodeURIComponent(e.batchId)}`,
      cta: "View batch",
      batchId: e.batchId,
    }));
}

/**
 * account: signed-in wallet; role: "manufacturer" | "distributor" | "pharmacy" | "regulator" | null
 */
export async function buildNotifications({ account, role, isAdmin }) {
  const events = await getAllEvents();
  const c = await getContract();
  if (!account || !role) return publicAlerts(events);

  const items = [];
  const nowSec = Math.floor(Date.now() / 1000);

  // Batches this wallet is part of (made, sent, received, or about to receive).
  const mine = new Set();
  for (const e of events) {
    if (e.type === "BatchCreated" && same(e.by, account)) mine.add(e.batchId);
    if (["TransferInitiated", "TransferAccepted", "TransferApproved"].includes(e.type) && (same(e.from, account) || same(e.to, account))) mine.add(e.batchId);
  }
  const batches = new Map(
    await Promise.all([...mine].map(async (id) => [id, await c.getBatch(id)]))
  );
  const holderOf = (id) => batches.get(id)?.currentOwner;
  const name = await namesFor([
    ...[...batches.values()].flatMap((b) => [b.currentOwner, b.pendingReceiver, b.manufacturer]),
    ...events.slice(-RECENT_EVENTS * 3).flatMap((e) => [e.from, e.to, e.by]),
  ]);

  // ── Needs action: incoming batches to accept (distributor / pharmacy) ──
  for (const [id, b] of batches) {
    if (same(b.pendingReceiver, account) && !b.receiverAccepted && Number(b.status) !== 4) {
      items.push({
        id: `accept:${id}:${b.currentOwner}`,
        severity: "action",
        title: `${id} is on its way to you`,
        detail: `${name(b.currentOwner)} sent ${b.drugName} (${Number(b.quantity).toLocaleString()} units). Accept it once it physically arrives (signature 2 of 3).`,
        href: "/dashboard",
        cta: "Review",
        batchId: id,
        group: "accept",
      });
    }
  }

  // ── Needs action: hand-offs waiting for the regulator ──
  if (role === "regulator") {
    const pending = await getPendingApprovals();
    const pn = await namesFor(pending.flatMap((p) => [p.from, p.to]));
    for (const p of pending) {
      items.push({
        id: `approve:${p.batchId}:${p.acceptedTx}`,
        severity: "action",
        title: `${p.batchId} needs your approval`,
        detail: `${pn(p.from)} → ${pn(p.to)}. Sender and receiver have both signed; your approval moves custody (signature 3 of 3).`,
        block: p.acceptedAt,
        href: "/dashboard",
        cta: "Approve or reject",
        batchId: p.batchId,
        group: "approve",
      });
    }
    // Hand-offs still waiting for the receiver (step 2), for oversight.
    const waiting = [];
    const open = new Map();
    for (const e of events) {
      if (e.type === "TransferInitiated") open.set(e.batchId, e);
      if (["TransferAccepted", "TransferApproved", "TransferRejected", "TransferCancelled", "BatchRecalled"].includes(e.type)) open.delete(e.batchId);
    }
    for (const e of open.values()) waiting.push(e);
    if (waiting.length) {
      items.push({
        id: `awaiting-receivers:${waiting.map((w) => w.txHash).join(",")}`,
        severity: "info",
        title: `${waiting.length} hand-off(s) waiting for the receiver`,
        detail: waiting.map((w) => `${w.batchId}: ${name(w.from)} → ${name(w.to)}`).join(" · "),
        href: "/ledger/approvals",
        cta: "View",
      });
    }
  }

  // ── Sender side: my outgoing hand-off was accepted and now waits for the regulator ──
  for (const [id, b] of batches) {
    if (same(b.currentOwner, account) && b.pendingReceiver !== ZeroAddress && b.receiverAccepted) {
      items.push({
        id: `sent-accepted:${id}:${b.pendingReceiver}`,
        severity: "info",
        title: `${name(b.pendingReceiver)} accepted ${id}`,
        detail: "Waiting for the regulator's approval (signature 3 of 3).",
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "Track",
        batchId: id,
      });
    }
    if (same(b.pendingReceiver, account) && b.receiverAccepted) {
      items.push({
        id: `recv-accepted:${id}`,
        severity: "info",
        title: `You accepted ${id}`,
        detail: "Waiting for the regulator's approval before custody moves to you.",
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "Track",
        batchId: id,
      });
    }
  }

  // ── Stock I hold: recalled (critical) or expiring soon ──
  for (const [id, b] of batches) {
    if (!same(b.currentOwner, account)) continue;
    const expiry = Number(b.expiryDate);
    if (Number(b.status) === 4) {
      items.push({
        id: `held-recalled:${id}`,
        severity: "critical",
        title: role === "pharmacy" ? `Do not dispense ${id}` : `${id} in your custody is recalled`,
        detail: `${b.drugName} has been recalled. Quarantine this stock and follow the regulator's instructions.`,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View recall",
        batchId: id,
      });
    } else if (expiry < nowSec) {
      items.push({
        id: `held-expired:${id}`,
        severity: "critical",
        title: `${id} has expired`,
        detail: `${b.drugName} you hold expired on ${new Date(expiry * 1000).toLocaleDateString()}. Remove it from circulation.`,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    } else if (expiry - nowSec < EXPIRY_WARNING_DAYS * DAY) {
      const days = Math.ceil((expiry - nowSec) / DAY);
      items.push({
        id: `held-expiring:${id}`,
        severity: "warning",
        title: `${id} expires in ${days} day${days === 1 ? "" : "s"}`,
        detail: `${b.drugName} (${Number(b.quantity).toLocaleString()} units) in your custody.`,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    }
  }

  // ── Recent news about my batches (approved, rejected, cancelled, recalled) ──
  const relevant = events.filter(
    (e) =>
      (e.batchId && (mine.has(e.batchId) || role === "regulator")) ||
      ((e.type === "Paused" || e.type === "Unpaused") && true)
  );
  for (const e of relevant.slice(-RECENT_EVENTS)) {
    const id = e.batchId;
    if (e.type === "TransferApproved" && (same(e.to, account) || same(e.from, account))) {
      items.push({
        id: `ev:${e.txHash}:${e.logIndex}`,
        severity: "success",
        title: same(e.to, account) ? `Custody of ${id} is now yours` : `${id} delivered to ${name(e.to)}`,
        detail: `The regulator approved the hand-off from ${name(e.from)} to ${name(e.to)}.`,
        block: e.blockNumber,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    }
    if (e.type === "TransferRejected" && role !== "regulator") {
      items.push({
        id: `ev:${e.txHash}:${e.logIndex}`,
        severity: "warning",
        title: `Hand-off of ${id} was rejected`,
        detail: `Regulator's reason: "${e.reason}". ${same(holderOf(id), account) ? "The batch is back with you." : "The batch stays with the sender."}`,
        block: e.blockNumber,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    }
    if (e.type === "TransferCancelled" && !same(e.by, account) && mine.has(id)) {
      items.push({
        id: `ev:${e.txHash}:${e.logIndex}`,
        severity: "info",
        title: `${name(e.by)} cancelled the hand-off of ${id}`,
        detail: "No custody change happened.",
        block: e.blockNumber,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    }
    if (e.type === "BatchRecalled" && (mine.has(id) || role === "regulator") && !same(holderOf(id), account)) {
      items.push({
        id: `ev:${e.txHash}:${e.logIndex}`,
        severity: "warning",
        title: `${id} was recalled`,
        detail: `Reason: "${e.reason}"${same(e.by, account) ? " (by you)" : ` by ${name(e.by)}`}.`,
        block: e.blockNumber,
        href: `/verify/${encodeURIComponent(id)}`,
        cta: "View",
        batchId: id,
      });
    }
  }

  // ── System state ──
  if (await c.paused()) {
    items.push({
      id: "system-paused",
      severity: "critical",
      title: "Hand-offs are paused",
      detail: isAdmin ? "You paused the system. Resume it from Admin controls when it's safe." : "The network admin has paused batch creation and hand-offs. Recalls still work.",
      href: "/dashboard",
      cta: isAdmin ? "Admin controls" : "Details",
    });
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.block ?? 0) - (a.block ?? 0));
}

/** One sentence for the alert bar, grouping same-kind action items. */
export function headline(items, role) {
  const crit = items.filter((i) => i.severity === "critical");
  if (crit.length) return { severity: "critical", text: crit.length === 1 ? crit[0].title : `${crit.length} urgent alerts need attention`, item: crit[0] };
  const accept = items.filter((i) => i.group === "accept");
  if (accept.length)
    return { severity: "action", text: accept.length === 1 ? `${accept[0].batchId} is waiting for you to accept` : `${accept.length} batches are waiting for you to accept`, item: accept[0] };
  const approve = items.filter((i) => i.group === "approve");
  if (approve.length)
    return { severity: "action", text: approve.length === 1 ? `${approve[0].batchId} is waiting for your approval` : `${approve.length} hand-offs are waiting for your approval`, item: approve[0] };
  return null;
}

export const roleName = (n) => ROLE[n] ?? "";
