import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { id as keccakId } from "ethers";
import { getAllEvents } from "../../lib/activity";
import { CONTRACT_ADDRESS, NETWORK, ROLE, addressUrl, getContract, isContractConfigured } from "../../lib/contract";
import { useWallet } from "../../pages/dashboard/WalletContext";
import { closest, parse } from "./engine";
import "./assistant.css";

const WELCOME = {
  from: "bot",
  text: "Hi, I'm the MediChain assistant. Ask me about a batch (e.g. \"where is PCM-2026-001?\"), or tell me what you want to do and I'll take you there.",
  chips: ["Check a batch", "Show the ledger", "How do I sign in?", "Why three signatures?"],
};

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Puts a value into a labelled input inside a section (so React sees the change).
function prefill(section, label, value) {
  const lab = [...(section?.querySelectorAll("label") ?? [])].find((l) => l.textContent.trim() === label);
  const input = lab && document.getElementById(lab.htmlFor);
  if (!input) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function Assistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signedIn, sessionRole, participant, isAdmin, signOut } = useWallet();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(null); // an intent waiting for a batch ID ("which batch?")
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
    if (location.pathname !== path) navigate(path);
    await sleep(50);
  };

  const role = signedIn ? sessionRole : null; // manufacturer | distributor | pharmacy | regulator
  const needRole = (roles, what) => {
    const names = roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(" or ");
    say(`${what} needs you to be signed in as ${names}. Choose the role on the home page and connect MetaMask.`, {
      chips: ["How do I sign in?"],
    });
    go("/").then(() => focusSection("Choose your role"));
  };

  const knownBatchIds = async () => (await getAllEvents()).filter((e) => e.type === "BatchCreated").map((e) => e.batchId);

  // Looks up a batch on-chain; returns a short summary or null (and offers "did you mean").
  const lookupBatch = async (id) => {
    const c = await getContract();
    const v = await c.verifyBatch(id);
    if (!v.exists) {
      const guesses = closest(id, await knownBatchIds());
      say(
        guesses.length
          ? `I couldn't find a batch called ${id} on the blockchain. Did you mean one of these?`
          : `There is no batch called ${id} on the blockchain. If it's printed on a pack, it may be counterfeit.`,
        { chips: guesses }
      );
      return null;
    }
    const b = await c.getBatch(id);
    const verdict = v.recalled ? "RECALLED" : v.expired ? "EXPIRED" : "GENUINE";
    const reason = v.recalled ? await c.recallReason(keccakId(id)) : "";
    return { v, b, verdict, reason };
  };

  const handle = async (text) => {
    let { intent, entities, faq } = parse(text);
    // Answering "which batch?" with just an ID continues the earlier request.
    if (pending.current && entities.batchId && ["verify", "unknown"].includes(intent)) intent = pending.current;
    pending.current = null;
    const id = entities.batchId;

    if (!isContractConfigured() && !["faq", "greet", "help", "unknown", "signin"].includes(intent)) {
      return say("This site isn't connected to a MediChain contract, so I can't read the blockchain right now.");
    }

    switch (intent) {
      case "greet":
      case "help":
        return say(WELCOME.text, { chips: WELCOME.chips });

      case "faq":
        return say(faq);

      case "verify":
      case "report": {
        if (!id) {
          pending.current = intent;
          return say("Which batch? Type its ID (printed on the pack, e.g. PCM-2026-001), or scan its QR code.", { chips: ["Scan a QR code"] });
        }
        const r = await lookupBatch(id);
        if (!r) return;
        const holder = r.v.currentHolder || short(r.b.currentOwner);
        say(
          `${id} is ${r.verdict}. ${r.v.drugName}, made by ${r.v.manufacturerName}, now held by ${holder}, with ${Number(r.v.hops) - 1} completed hand-off(s).` +
            (r.reason ? ` Recall reason: "${r.reason}".` : "") +
            (intent === "report" ? " Opening the lab-report check: drop the PDF there to compare its fingerprint." : " Opening its full verification."),
          { tone: r.verdict === "GENUINE" ? "ok" : "bad" }
        );
        await go(`/verify/${encodeURIComponent(id)}`);
        if (intent === "report") await focusSection("Check lab report");
        return;
      }

      case "recall": {
        if (id) {
          const r = await lookupBatch(id);
          if (!r) return;
          if (r.verdict === "RECALLED") {
            say(`${id} has already been recalled. Reason: "${r.reason}".`, { tone: "bad" });
            return go(`/verify/${encodeURIComponent(id)}`);
          }
        }
        if (role === "regulator" || role === "manufacturer") {
          say(id ? `Opening the recall form for ${id}. Add a reason, then confirm twice: a recall can't be undone.` : "Opening the recall form. Enter the batch ID and a reason.");
          await go("/dashboard");
          const sec = await focusSection("Recall batch");
          if (id) prefill(sec, "Batch ID", id);
          return;
        }
        if (id) {
          say(`${id} is not recalled. Only the regulator or the batch's manufacturer can recall it.`);
          return go(`/verify/${encodeURIComponent(id)}`);
        }
        return needRole(["regulator", "manufacturer"], "Recalling a batch");
      }

      case "create":
        if (role !== "manufacturer") return needRole(["manufacturer"], "Creating a batch");
        say("Opening Create batch. Fill in the drug, dates and quantity, and attach the lab report so its fingerprint is stored.");
        await go("/dashboard");
        {
          const sec = await focusSection("Create batch");
          if (id) prefill(sec, "Batch ID", id);
        }
        return;

      case "send": {
        if (!["manufacturer", "distributor"].includes(role)) return needRole(["manufacturer", "distributor"], "Sending a batch");
        say(`Opening Transfer custody${id ? ` for ${id}` : ""}. Enter the receiver's wallet address. ${role === "manufacturer" ? "Manufacturers send to distributors." : "Distributors send to pharmacies or other distributors."} This is signature 1 of 3.`);
        await go("/dashboard");
        const sec = await focusSection("Transfer custody");
        if (id) prefill(sec, "Batch ID", id);
        return;
      }

      case "accept":
        if (!["distributor", "pharmacy"].includes(role)) return needRole(["distributor", "pharmacy"], "Accepting a batch");
        say("Opening your batches. Incoming ones show an Accept button. Accepting is signature 2 of 3; the regulator then approves.");
        await go("/dashboard");
        await focusSection("My batches");
        return;

      case "approve":
        if (role === "regulator") {
          say("Opening your approval queue. Approve to move custody (signature 3 of 3), or reject with a reason.");
          await go("/dashboard");
          await focusSection("Regulator approvals");
          return;
        }
        say("Only the regulator can approve hand-offs. Here is the public approval queue so you can see what's waiting.");
        return go("/ledger/approvals");

      case "register":
        if (!isAdmin) return say("Only the network admin can register companies. Send them your wallet address and role.");
        say("Opening Register participant. Paste the company's wallet address, choose its role, name and location.");
        await go("/dashboard");
        await focusSection("Register participant");
        return;

      case "pause":
        if (!isAdmin) return say("Only the network admin can pause or resume hand-offs in an emergency. Recalls keep working while paused.");
        say("Opening the admin emergency controls.");
        await go("/dashboard");
        await focusSection("Admin controls");
        return;

      case "scan":
        say("Opening the verify page. Tap Scan QR and point your camera at the code on the pack.");
        await go("/verify");
        return;

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
        if (signedIn) {
          say(`You're signed in as ${ROLE[participant.role]}${participant.name ? ` (${participant.name})` : ""}. Opening your dashboard.`);
          return go("/dashboard");
        }
        say("Choose your role on the home page, then click Connect MetaMask. The contract checks that your wallet is registered for that role.");
        await go("/");
        await focusSection("Choose your role");
        return;

      case "signout":
        if (!signedIn) return say("You're not signed in.");
        await signOut();
        say("You're logged out and MetaMask has been disconnected. You can sign in with another role now.");
        return go("/");

      case "contract": {
        const url = addressUrl(CONTRACT_ADDRESS);
        return say(`The MediChain smart contract is ${CONTRACT_ADDRESS} on ${NETWORK.name}.`, url ? { link: { href: url, label: "View it on the block explorer" } } : {});
      }

      default:
        return say("I'm not sure what you need. Try a batch ID, or one of these:", {
          chips: ["Check a batch", "Show the ledger", "Create a batch", "Pending approvals", "How do I sign in?"],
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
          <span>Answers from live blockchain data</span>
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
          placeholder="Ask about a batch, or what you want to do…"
          aria-label="Message"
        />
        <button type="submit" disabled={!input.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </form>
    </section>
  );
}
