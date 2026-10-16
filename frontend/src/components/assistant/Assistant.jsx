import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ZeroHash, id as keccakId } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { CONTRACT_ADDRESS, NETWORK, ROLE, STATUS, addressUrl, getContract, isContractConfigured } from "../../lib/contract";
import { useWallet } from "../../pages/dashboard/WalletContext";
import { batchState, describe, execute, incomingFor, myBatches, pendingApprovals, resolveParticipant } from "./actions";
import {
  closest,
  extractDrug,
  extractExpiry,
  extractNameLocation,
  extractQuantity,
  extractReceiverName,
  extractRole,
  isNo,
  isYes,
  normaliseBatchId,
  parse,
  parseDate,
} from "./engine";
import "./assistant.css";

const WELCOME = {
  from: "bot",
  text: "Hi, I'm the MediChain assistant. Ask about any batch, or tell me what to do (\"create a batch\", \"send AMX-2026-014 to FastMed\", \"approve pending hand-offs\") and I'll do it for you.",
  chips: ["Check a batch", "What batches do I have?", "Create a batch", "Show the ledger"],
};

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayIso = () => new Date().toISOString().slice(0, 10);
const toUnix = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
const pretty = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

// Scrolls to the card / heading with this title on the current page and highlights it briefly.
async function focusSection(title, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const el = [...document.querySelectorAll("section.card, aside, section, .verify-card")].find((s) => {
      const h = s.querySelector(".card-title, h2, h3");
      return h && h.textContent.trim().startsWith(title);
    });
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("as-flash");
      setTimeout(() => el.classList.remove("as-flash"), 1800);
      return el;
    }
    await sleep(100);
  }
  return null;
}

// What each action needs, who may do it, and how to ask for each missing detail.
const ACTIONS = {
  create: { roles: ["manufacturer"], label: "Creating a batch", slots: ["batchId", "drugName", "quantity", "expiry"] },
  send: { roles: ["manufacturer", "distributor"], label: "Sending a batch", slots: ["batchId", "to"] },
  accept: { roles: ["distributor", "pharmacy"], label: "Accepting a batch", slots: ["batchId"] },
  approve: { roles: ["regulator"], label: "Approving a hand-off", slots: ["batchId"] },
  reject: { roles: ["regulator"], label: "Rejecting a hand-off", slots: ["batchId", "reason"] },
  recall: { roles: ["regulator", "manufacturer"], label: "Recalling a batch", slots: ["batchId", "reason"] },
  register: { roles: ["admin"], label: "Registering a company", slots: ["address", "role", "name", "location"] },
  pause: { roles: ["admin"], label: "Pausing hand-offs", slots: [] },
  resume: { roles: ["admin"], label: "Resuming hand-offs", slots: [] },
};

const QUESTIONS = {
  batchId: "Which batch ID?",
  drugName: "What's the drug name and strength? (e.g. Paracetamol 500mg)",
  quantity: "How many units are in the batch?",
  expiry: "When does it expire? (e.g. Dec 2027, 31/12/2027 or 2027-12-31)",
  to: "Who should receive it? Give the company name or wallet address.",
  reason: "What's the reason? It's stored publicly on the blockchain.",
  address: "What's the company's wallet address? (starts with 0x)",
  role: "Which role? Manufacturer, Distributor, Pharmacy or Regulator.",
  name: "What's the company name?",
  location: "Where is it located? (or say \"skip\")",
};

export default function Assistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null); // { action, slots, awaiting }
  const pendingVerify = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const say = (text, extra = {}) => setMessages((m) => [...m, { from: "bot", text, ...extra }]);
  const go = async (path) => {
    if (location.pathname + location.search !== path) navigate(path);
    await sleep(60);
  };
  const changed = () => window.dispatchEvent(new Event("medichain:changed")); // dashboards reload their lists

  const role = wallet.signedIn ? wallet.sessionRole : null;
  const allowed = (roles) => roles.some((r) => (r === "admin" ? wallet.isAdmin : r === role));

  const askSignIn = (spec) => {
    const names = spec.roles.map((r) => (r === "admin" ? "the network admin" : r[0].toUpperCase() + r.slice(1))).join(" or ");
    say(`${spec.label} needs you to be signed in as ${names}. Choose the role on the home page and connect MetaMask, then ask me again.`);
    go("/").then(() => focusSection("Choose your role"));
  };

  const knownBatchIds = async () => (await getAllEvents()).filter((e) => e.type === "BatchCreated").map((e) => e.batchId);

  // ───────── Answers about a batch ─────────
  const answerBatch = async (id, mode) => {
    const s = await batchState(id);
    if (!s) {
      const guesses = closest(id, await knownBatchIds());
      say(
        guesses.length
          ? `I couldn't find ${id} on the blockchain. Did you mean one of these?`
          : `There is no batch called ${id} on the blockchain. If that ID is printed on a pack, it may be counterfeit.`,
        { chips: guesses, tone: guesses.length ? undefined : "bad" }
      );
      return;
    }
    const verdict = s.v.recalled ? "RECALLED" : s.v.expired ? "EXPIRED" : "GENUINE";
    const reason = s.v.recalled ? await (await getContract()).recallReason(keccakId(id)) : "";
    say(
      `${id} is ${verdict}. ${s.v.drugName} by ${s.v.manufacturerName}, now held by ${s.v.currentHolder || short(s.b.currentOwner)}, ` +
        `status "${STATUS[Number(s.b.status)]}", ${Number(s.v.hops) - 1} completed hand-off(s).` +
        (reason ? ` Recall reason: "${reason}".` : "") +
        (mode === "report" ? " Opening the lab-report check: drop the PDF there to compare its fingerprint." : ""),
      { tone: verdict === "GENUINE" ? "ok" : "bad" }
    );
    await go(`/verify/${encodeURIComponent(id)}`);
    if (mode === "report") await focusSection("Check lab report");
  };

  // ───────── Actions: collect details, check, confirm, sign ─────────

  // Fills slots from the first sentence ("send AMX-2026-014 to FastMed").
  const prefillSlots = (action, text, entities) => {
    const slots = {};
    if (entities.batchId) slots.batchId = entities.batchId;
    if (action === "create") {
      const drug = extractDrug(text);
      if (drug) slots.drugName = drug;
      const q = extractQuantity(text);
      if (q) slots.quantity = q;
      const e = extractExpiry(text);
      if (e) slots.expiry = e;
    }
    if (action === "send") {
      const who = entities.address ?? extractReceiverName(text);
      if (who) slots.toText = who;
    }
    if (["reject", "recall"].includes(action)) {
      const r = text.match(/\b(?:because|reason[:\s]+|due to|as)\s+(.{3,200})$/i)?.[1];
      if (r) slots.reason = r.trim();
    }
    if (action === "register") {
      if (entities.address) slots.address = entities.address;
      const r = extractRole(text.replace(/register/i, ""));
      if (r) slots.role = r;
      const { name, location: loc } = extractNameLocation(text);
      if (name) slots.name = name;
      if (loc) slots.location = loc;
    }
    return slots;
  };

  // Reads one answer for the detail we asked about. Returns an error message to show, or null.
  const fillSlot = async (d, text) => {
    const t = text.trim();
    switch (d.awaiting) {
      case "batchId": {
        const id = parse(t).entities.batchId ?? (/^[A-Za-z0-9-]{3,64}$/.test(t) ? normaliseBatchId(t) : null);
        if (!id) return "That doesn't look like a batch ID (e.g. PCM-2026-001).";
        d.slots.batchId = id;
        return null;
      }
      case "drugName":
        if (t.length < 2 || t.length > 100) return "Please give a drug name between 2 and 100 characters.";
        d.slots.drugName = extractDrug(t) ?? t;
        return null;
      case "quantity": {
        const n = extractQuantity(t) ?? Number(t.replace(/[^\d]/g, ""));
        if (!Number.isInteger(n) || n <= 0) return "Please give the number of units, e.g. 2000.";
        d.slots.quantity = n;
        return null;
      }
      case "expiry": {
        const iso = parseDate(t) ?? extractExpiry(t);
        if (!iso) return "I couldn't read that date. Try e.g. Dec 2027 or 31/12/2027.";
        d.slots.expiry = iso;
        return null;
      }
      case "to":
        d.slots.toText = t;
        delete d.slots.to;
        return null;
      case "reason":
        if (t.length < 3 || t.length > 200) return "Please give a reason between 3 and 200 characters.";
        d.slots.reason = t;
        return null;
      case "address": {
        const a = t.match(/0x[0-9a-fA-F]{40}/)?.[0];
        if (!a) return "That isn't a wallet address. It should start with 0x and have 40 hex characters.";
        d.slots.address = a;
        return null;
      }
      case "role": {
        const r = extractRole(t);
        if (!r) return "Please choose Manufacturer, Distributor, Pharmacy or Regulator.";
        d.slots.role = r;
        return null;
      }
      case "name":
        if (t.length < 1 || t.length > 100) return "Please give a name up to 100 characters.";
        d.slots.name = t;
        return null;
      case "location":
        d.slots.location = /^skip$/i.test(t) ? "" : t.slice(0, 100);
        return null;
      default:
        return null;
    }
  };

  // Checks the details against the chain; may clear a slot (to re-ask) or auto-fill one.
  const validate = async (d) => {
    const { action, slots } = d;
    const me = wallet.account;

    if (["accept", "approve", "reject"].includes(action) && !slots.batchId) {
      const list = action === "accept" ? (await incomingFor(me)).map((x) => x.id) : (await pendingApprovals()).map((x) => x.batchId);
      if (!list.length) return { stop: action === "accept" ? "Nothing is waiting for you to accept right now." : "No hand-offs are waiting for the regulator right now." };
      if (list.length === 1) slots.batchId = list[0];
      else return { ask: "batchId", text: `Which one? These are waiting: ${list.join(", ")}.`, chips: list };
    }

    if (slots.batchId && action !== "create") {
      const s = await batchState(slots.batchId);
      if (!s) {
        const guesses = closest(slots.batchId, await knownBatchIds());
        delete slots.batchId;
        return { ask: "batchId", text: `That batch doesn't exist.${guesses.length ? " Did you mean:" : " Which batch ID?"}`, chips: guesses };
      }
      if (s.v.recalled && action !== "recall") return { stop: `${slots.batchId} is recalled, so it can't be moved any more.` };
      if (action === "recall" && s.v.recalled) return { stop: `${slots.batchId} is already recalled.` };
      if (action === "send" && s.b.currentOwner.toLowerCase() !== me.toLowerCase()) return { stop: `You don't hold ${slots.batchId}; only its current holder can send it.` };
      if (action === "send" && s.pending) return { stop: `${slots.batchId} already has a hand-off in progress. Cancel it from your dashboard first, or wait for it to finish.` };
      if (action === "accept" && (s.pending?.toLowerCase() !== me.toLowerCase() || s.b.receiverAccepted))
        return { stop: `${slots.batchId} isn't waiting for you to accept it.` };
      if (["approve", "reject"].includes(action) && !(s.pending && (action === "reject" || s.b.receiverAccepted)))
        return { stop: `${slots.batchId} has no hand-off waiting for the regulator.` };
      if (action === "recall" && role === "manufacturer" && s.b.manufacturer.toLowerCase() !== me.toLowerCase())
        return { stop: "A manufacturer can only recall its own batches." };
      d.batch = s;
    }

    if (action === "create" && slots.batchId) {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(slots.batchId)) {
        delete slots.batchId;
        return { ask: "batchId", text: "Batch IDs can use letters, numbers and dashes, up to 64 characters. Which ID?" };
      }
      if (await batchState(slots.batchId)) {
        delete slots.batchId;
        return { ask: "batchId", text: "That batch ID is already used. Please choose another." };
      }
    }
    if (action === "create" && slots.expiry && slots.expiry <= todayIso()) {
      delete slots.expiry;
      return { ask: "expiry", text: "The expiry date has to be in the future. When does it expire?" };
    }

    if (action === "send" && slots.toText && !slots.to) {
      const allowedTo = role === "manufacturer" ? [2] : [2, 3];
      const r = await resolveParticipant(slots.toText, allowedTo);
      delete slots.toText;
      if (r.match) {
        if (r.match.address.toLowerCase() === me.toLowerCase()) return { ask: "to", text: "You can't send a batch to yourself. Who should receive it?" };
        slots.to = r.match;
      } else if (r.unknownAddress) {
        return { ask: "to", text: `${short(r.unknownAddress)} isn't an active ${role === "manufacturer" ? "distributor" : "distributor or pharmacy"}. Who should receive it?` };
      } else {
        const opts = (r.options ?? []).filter((p) => p.address.toLowerCase() !== me.toLowerCase()).slice(0, 5);
        return { ask: "to", text: opts.length ? `Which ${role === "manufacturer" ? "distributor" : "company"}?` : "There's no active company you can send to.", chips: opts.map((p) => p.name || p.address) };
      }
    }

    if (action === "pause" || action === "resume") {
      const paused = await (await getContract()).paused();
      if (action === "pause" && paused) return { stop: "Hand-offs are already paused." };
      if (action === "resume" && !paused) return { stop: "Hand-offs are already running." };
    }
    return {};
  };

  const summary = ({ action, slots }) => {
    switch (action) {
      case "create": return `Create batch ${slots.batchId}: ${slots.drugName}, ${slots.quantity.toLocaleString()} units, made today, expires ${pretty(slots.expiry)}.`;
      case "send": return `Send ${slots.batchId} to ${describe(slots.to)}. This is signature 1 of 3.`;
      case "accept": return `Accept ${slots.batchId}, confirming you physically received it. This is signature 2 of 3.`;
      case "approve": return `Approve the hand-off of ${slots.batchId}. Custody moves now (signature 3 of 3).`;
      case "reject": return `Reject the hand-off of ${slots.batchId} because "${slots.reason}". The batch stays with the sender.`;
      case "recall": return `Recall ${slots.batchId} because "${slots.reason}". This is permanent and shown publicly.`;
      case "register": return `Register ${short(slots.address)} as ${ROLE[slots.role]} "${slots.name}"${slots.location ? ` in ${slots.location}` : ""}.`;
      case "pause": return "Pause all batch creation and hand-offs. Recalls keep working.";
      case "resume": return "Resume batch creation and hand-offs.";
      default: return "";
    }
  };

  // Asks for the next missing detail, or shows the summary for confirmation.
  const progress = async () => {
    const d = dialog.current;
    const spec = ACTIONS[d.action];
    for (;;) {
      const v = await validate(d);
      if (v.stop) {
        dialog.current = null;
        return say(v.stop);
      }
      if (v.ask) {
        d.awaiting = v.ask;
        return say(v.text, { chips: v.chips });
      }
      const missing = spec.slots.find((s) => d.slots[s] === undefined && !(s === "to" && d.slots.toText));
      if (missing) {
        if (missing === "to" && d.slots.toText) continue;
        d.awaiting = missing;
        const chips =
          missing === "role" ? ["Manufacturer", "Distributor", "Pharmacy", "Regulator"] :
          missing === "location" ? ["skip"] :
          missing === "to" ? ((await resolveParticipant("", role === "manufacturer" ? [2] : [2, 3])).options ?? [])
            .filter((p) => p.address.toLowerCase() !== wallet.account.toLowerCase()).slice(0, 5).map((p) => p.name || p.address) :
          undefined;
        return say(QUESTIONS[missing], { chips });
      }
      if (d.slots.toText) continue; // resolve the receiver on the next validate pass
      d.awaiting = "confirm";
      return say(`${summary(d)} Shall I go ahead?`, { chips: ["Confirm", "Cancel"] });
    }
  };

  const run = async () => {
    const { action, slots } = dialog.current;
    dialog.current = null;
    const calls = {
      create: ["createBatch", [slots.batchId, slots.drugName, toUnix(todayIso()), toUnix(slots.expiry), slots.quantity, ZeroHash]],
      send: ["initiateTransfer", [slots.batchId, slots.to?.address]],
      accept: ["acceptTransfer", [slots.batchId]],
      approve: ["approveTransfer", [slots.batchId]],
      reject: ["rejectTransfer", [slots.batchId, slots.reason]],
      recall: ["recallBatch", [slots.batchId, slots.reason]],
      register: ["registerParticipant", [slots.address, slots.role, slots.name, slots.location ?? ""]],
      pause: ["pause", []],
      resume: ["unpause", []],
    };
    const [method, args] = calls[action];
    say("Checking with the contract, then opening MetaMask. Please confirm there.");
    try {
      const r = await execute(method, args, (stage) => stage === "mining" && say("Signed. Waiting for the next block (about 12 seconds)…"));
      say(`Done. Recorded in block #${r.block}.`, { tone: "ok", link: r.url ? { href: r.url, label: "View the transaction" } : undefined });
      changed();
      if (slots.batchId) await go(`/verify/${encodeURIComponent(slots.batchId)}`);
      else if (action === "register") await go(`/ledger?address=${slots.address}`);
      else await go("/dashboard");
    } catch (err) {
      say(`That didn't go through: ${err.message}`, { tone: "bad" });
    }
  };

  const startAction = async (action, text, entities) => {
    const spec = ACTIONS[action];
    if (!allowed(spec.roles)) return askSignIn(spec);
    dialog.current = { action, slots: prefillSlots(action, text, entities), awaiting: null };
    return progress();
  };

  // ───────── Main handler ─────────
  const handle = async (text) => {
    const parsed = parse(text);
    let { intent } = parsed;
    const { entities, faq } = parsed;

    // An action in progress: this message answers its question, confirms or cancels it.
    const d = dialog.current;
    if (d) {
      if (isNo(text)) {
        dialog.current = null;
        return say("Cancelled. Nothing was sent to the blockchain.");
      }
      // Free-text answers (a reason, a name) must never be mistaken for a new command.
      const freeText = ["drugName", "reason", "name", "location"].includes(d.awaiting);
      const navigates = ["ledger", "blocks", "help", "signout", "greet", "mybatches", "faq", "tx", "block"].includes(intent);
      const otherAction = Object.hasOwn(ACTIONS, intent) && intent !== d.action;
      if (d.awaiting === "confirm") {
        if (isYes(text)) return run();
        if (intent === "unknown") return say("Shall I go ahead? Reply Confirm or Cancel.", { chips: ["Confirm", "Cancel"] });
        dialog.current = null; // the user moved on: drop the unconfirmed action
        say("Okay, I've dropped that request; nothing was sent.");
      } else if (d.awaiting && !(freeText ? ["help", "signout"].includes(intent) : navigates || otherAction)) {
        const err = await fillSlot(d, text);
        if (err) return say(err);
        return progress();
      } else {
        dialog.current = null;
      }
    }

    if (pendingVerify.current && entities.batchId && ["verify", "unknown"].includes(intent)) intent = pendingVerify.current;
    pendingVerify.current = null;

    if (!isContractConfigured() && !["faq", "greet", "help", "unknown", "signin"].includes(intent)) {
      return say("This site isn't connected to a MediChain contract, so I can't read the blockchain right now.");
    }

    switch (intent) {
      case "greet":
      case "help":
        return say(
          "I can check any batch, and do things for you: create a batch, send or accept one, approve or reject hand-offs, recall a batch, register a company, or pause the system. Just say it.",
          { chips: WELCOME.chips }
        );
      case "faq":
        return say(faq);

      case "verify":
      case "report":
        if (!entities.batchId) {
          pendingVerify.current = intent;
          return say("Which batch? Type its ID (printed on the pack, e.g. PCM-2026-001), or scan its QR code.", { chips: ["Scan a QR code"] });
        }
        return answerBatch(entities.batchId, intent);

      case "recall":
        // "was X recalled?" is a question; "recall X" is an action.
        if (entities.batchId && /\b(was|is|has|have|been|why)\b/i.test(text)) return answerBatch(entities.batchId);
        return startAction("recall", text, entities);

      case "create":
      case "send":
      case "accept":
      case "approve":
      case "reject":
      case "register":
      case "pause":
      case "resume":
        if (intent === "approve" && !wallet.isAdmin && role !== "regulator" && /\b(show|list|pending|what)\b/i.test(text)) {
          say("Only the regulator can approve. Here is the public approval queue.");
          return go("/ledger/approvals");
        }
        return startAction(intent, text, entities);

      case "mybatches": {
        if (!wallet.signedIn) return askSignIn({ roles: ["manufacturer", "distributor", "pharmacy"], label: "Seeing your batches" });
        const list = await myBatches(wallet.account);
        if (role === "manufacturer") {
          // Manufacturers get the full My batches page, pre-searched when they name a batch.
          const made = list.filter(({ b }) => b.manufacturer.toLowerCase() === wallet.account.toLowerCase()).length;
          say(`You've created ${made} batch(es). Opening My batches, where you can search, filter and export them.`);
          return go(entities.batchId ? `/batches?q=${encodeURIComponent(entities.batchId)}` : "/batches");
        }
        if (!list.length) return say("You don't have any batches yet.", { chips: role === "manufacturer" ? ["Create a batch"] : [] });
        const lines = list.slice(0, 8).map(({ id, b }) => `${id}: ${STATUS[Number(b.status)]}`);
        say(`You have ${list.length} batch(es):\n${lines.join("\n")}`, { chips: list.slice(0, 6).map((x) => x.id) });
        return;
      }

      case "scan":
        say("Opening the verify page. Tap Scan QR and point your camera at the code on the pack.");
        return go("/verify");
      case "ledger":
        say("Here is the public ledger: every transaction with its block, signer and receipt.");
        return go("/ledger");
      case "blocks":
        say("Here are the blocks holding MediChain records, each linked to the previous one by its hash.");
        return go("/ledger/blocks");
      case "block":
        say(`Opening block #${entities.block}.`);
        return go(`/ledger/block/${entities.block}`);
      case "tx":
        say("Opening that transaction's full receipt: who signed it, which block, what it did.");
        return go(`/ledger/tx/${entities.tx}`);
      case "address": {
        const p = await (await getContract()).participants(entities.address);
        const r = Number(p.role);
        say(
          r
            ? `${short(entities.address)} is ${p.name || "a participant"} (${ROLE[r]}${p.location ? `, ${p.location}` : ""})${p.active ? "" : ", currently deactivated"}. Showing its activity.`
            : `${short(entities.address)} isn't registered on MediChain. Showing any activity it has.`
        );
        return go(`/ledger?address=${entities.address}`);
      }

      case "signin":
        if (wallet.signedIn) {
          say(`You're signed in as ${ROLE[wallet.participant.role]}${wallet.participant.name ? ` (${wallet.participant.name})` : ""}. Opening your dashboard.`);
          return go("/dashboard");
        }
        say("Choose your role on the home page, then click Connect MetaMask. The contract checks that your wallet is registered for that role.");
        await go("/");
        await focusSection("Choose your role");
        return;
      case "signout":
        if (!wallet.signedIn) return say("You're not signed in.");
        await wallet.signOut();
        say("You're logged out and MetaMask has been disconnected. You can sign in with another role now.");
        return go("/");

      case "contract": {
        const url = addressUrl(CONTRACT_ADDRESS);
        return say(`The MediChain smart contract is ${CONTRACT_ADDRESS} on ${NETWORK.name}.`, url ? { link: { href: url, label: "View it on the block explorer" } } : {});
      }

      default:
        return say("I'm not sure what you need. Try a batch ID, or one of these:", {
          chips: ["Check a batch", "What batches do I have?", "Create a batch", "Pending approvals", "How do I sign in?"],
        });
    }
  };

  // Messages are answered strictly in order; typing while an answer is loading queues the new one.
  const queue = useRef(Promise.resolve());
  const inFlight = useRef(0);
  const handleRef = useRef(handle);
  handleRef.current = handle; // always run with the latest role/page

  const send = useCallback((raw) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((m) => [...m, { from: "user", text }]);
    setInput("");
    inFlight.current += 1;
    setBusy(true);
    queue.current = queue.current.then(async () => {
      try {
        await handleRef.current(text);
      } catch (err) {
        say(`Sorry, I couldn't reach the blockchain (${err.shortMessage || err.message}). Please try again.`);
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
      }
    });
  }, []);

  if (!open) {
    return (
      <button type="button" className="as-launch" onClick={() => setOpen(true)} aria-label="Open MediChain assistant">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
        </svg>
        <span>Ask MediChain</span>
      </button>
    );
  }

  return (
    <section className="as-panel" role="dialog" aria-label="MediChain assistant">
      <header className="as-head">
        <div>
          <strong>MediChain Assistant</strong>
          <span>{wallet.signedIn ? `Acting as ${ROLE[wallet.participant.role] ?? "…"}` : "Answers from live blockchain data"}</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
      </header>
      <div className="as-list" ref={listRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`as-msg as-${m.from}${m.tone ? ` as-${m.tone}` : ""}`}>
            <p>{m.text}</p>
            {m.link && (
              <a href={m.link.href} target="_blank" rel="noreferrer">{m.link.label} ↗</a>
            )}
            {m.chips?.length > 0 && (
              <div className="as-chips">
                {m.chips.map((c) => (
                  <button key={c} type="button" onClick={() => send(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="as-msg as-bot as-typing"><span /><span /><span /></div>}
      </div>
      <form
        className="as-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, or tell me what to do…"
          aria-label="Message"
        />
        <button type="submit" disabled={!input.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </form>
    </section>
  );
}
