// MediChain Assistant: understands a user's question and decides where to take them.
// Runs entirely in the browser (no API key, no server), so it is instant and private.
// parse() is pure (text -> intent + entities) so it can be unit-tested.

const TX_HASH = /\b0x[0-9a-fA-F]{64}\b/;
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/;
const BLOCK = /\bblock\s*#?\s*(\d{1,12})\b/i;
// Batch IDs look like PCM-2026-001 / MED-20261015-K3JS: letters, then hyphenated parts, at least one digit.
const BATCH = /\b([A-Za-z]{2,10}(?:-[A-Za-z0-9]{1,12}){1,4})\b/g;

// Intent keyword groups, checked in order of priority. Each entry: [intent, regex].
const INTENTS = [
  ["greet", /^\s*(hi|hello|hey|namaste|good (morning|afternoon|evening))\b[\s!.]*$/i],
  ["help", /\b(help|what can you do|how do i use|commands|options)\b/i],
  ["recall", /\b(recall|recalled|withdraw|pull (it|back)|unsafe|contaminat)/i],
  ["mybatches", /\b(my (batches|stock|inventory|custody)|what (batches )?(do|does) (i|we) (have|hold|own)|batches (do )?(i|we) (have|hold|own)|list (my )?batches)\b/i],
  ["reject", /\b(reject|refuse|deny|decline)\b/i],
  ["approve", /\b(approve|approval|countersign|pending approvals?|step 3|third signature)\b/i],
  ["accept", /\b(accept|receive|incoming|confirm receipt|step 2)\b/i],
  ["send", /\b(send|transfer|hand ?over|hand-?off|ship|dispatch|move (it|the batch))\b/i],
  ["create", /\b(create|register|add|new|make|manufacture)\b.*\bbatch\b|\bbatch\b.*\b(create|register|new)\b/i],
  ["register", /\b(register|add|onboard)\b.*\b(company|participant|pharmacy|distributor|manufacturer|regulator|wallet|member|0x[0-9a-f]{40})\b/i],
  ["resume", /\b(resume|unpause|restart|un-?freeze)\b/i],
  ["pause", /\b(pause|emergency|freeze|stop all)\b/i],
  ["report", /\b(lab report|certificate|report|fingerprint|sha-?256|pdf|document)\b/i],
  ["scan", /\b(scan|qr|camera|barcode)\b/i],
  ["blocks", /\b(blocks?|chain view|hash[- ]linked|parent hash)\b/i],
  ["ledger", /\b(ledger|transactions?|activity|audit|history of all|all records|explorer)\b/i],
  ["signout", /\b(sign (me )?out|signout|log (me )?out|logout|disconnect|switch roles?|change roles?)\b/i],
  ["signin", /\b(sign (me )?in|signin|log (me )?in|login|connect|metamask|wallet|my role|dashboard)\b/i],
  ["verify", /\b(verify|check|genuine|fake|counterfeit|real|authentic|details?|status|where|track|trace|history|info|about|find|show|look ?up|expir)/i],
  ["contract", /\b(contract address|smart contract|etherscan|polygonscan)\b/i],
];

const FAQ = [
  [/\b(3|three) (signatures?|step)|why (does|do) .*approv|how (does|do) (a )?(hand-?off|transfer)/i,
    "Every hand-off needs three signatures: the sender initiates, the receiver confirms they physically got the batch, and the regulator approves. Custody only moves after all three, and the smart contract enforces it."],
  [/\b(gas|fee|cost|how much)\b/i,
    "Writing to the blockchain costs a tiny fee called gas, paid by the wallet that signs. Reading and verifying are free. On the Sepolia test network the fees are paid with free test ETH."],
  [/\bfaucet\b/i,
    "A faucet is a website that gives free test currency for a test network. MediChain doesn't use one; companies' wallets were funded once so they can pay gas."],
  [/\b(sepolia|polygon|which (network|chain)|testnet)\b/i,
    "MediChain runs on Ethereum Sepolia, a public test network. The same contract can run on Polygon for production, where fees are a fraction of a cent."],
  [/\b(database|where.*(stored|saved)|data stored)\b/i,
    "There is no separate database. All records live in the MediChain smart contract on the blockchain, copied across thousands of computers, so no one can edit or delete them."],
  [/\b(what is|what's) (medichain|this (site|app|website))\b|\babout medichain\b/i,
    "MediChain tracks medicine batches from manufacturer to distributor to pharmacy on the blockchain. Anyone can verify a batch; every hand-off is signed by three parties."],
  [/\b(blockchain|what is a block|immutable|tamper)\b/i,
    "A blockchain is a shared record copied on thousands of computers. Each block stores the hash of the one before it, so changing an old entry would break every later link. That's why MediChain records can't be faked."],
  [/\b(safe|secure|security|trust)\b/i,
    "Every action is signed with the company's MetaMask key, roles and routes are enforced by the smart contract, and anyone can cross-check records on Etherscan."],
];

/** Normalises a batch ID the way users type them ("pcm 2026 001" -> "PCM-2026-001"). */
export function normaliseBatchId(s) {
  return s.trim().toUpperCase().replace(/\s+/g, "-");
}

/** Extracts entities from free text. */
export function extract(text) {
  const tx = text.match(TX_HASH)?.[0] ?? null;
  const withoutTx = tx ? text.replace(tx, " ") : text;
  const address = withoutTx.match(ADDRESS)?.[0] ?? null;
  const block = text.match(BLOCK)?.[1] ?? null;

  // "pcm 2026 001" style: rejoin letter + number groups separated by spaces
  const spaced = text.match(/\b([A-Za-z]{2,10})[\s_]+(\d{2,8})[\s_-]+([A-Za-z0-9]{1,12})\b/);
  let batchId = null;
  const cleaned = withoutTx.replace(ADDRESS, " ");
  for (const m of cleaned.matchAll(BATCH)) {
    if (/\d/.test(m[1]) && !/^0x/i.test(m[1])) {
      batchId = normaliseBatchId(m[1]);
      break;
    }
  }
  if (!batchId && spaced) batchId = normaliseBatchId(`${spaced[1]}-${spaced[2]}-${spaced[3]}`);
  return { tx, address, block, batchId };
}

/** Text -> { intent, entities, faq }. */
export function parse(text) {
  const entities = extract(text);
  const faq = FAQ.find(([re]) => re.test(text))?.[1] ?? null;

  // Entities that only make sense one way decide the intent on their own.
  if (entities.tx) return { intent: "tx", entities, faq: null };
  if (entities.block && !entities.batchId) return { intent: "block", entities, faq: null };

  let intent = INTENTS.find(([, re]) => re.test(text))?.[0] ?? null;
  // A bare batch ID ("PCM-2026-001") or a question about one means "show me that batch".
  if (entities.batchId && (!intent || ["ledger", "signin", "help", "blocks"].includes(intent))) intent = "verify";
  if (entities.address && (!intent || intent === "verify" || intent === "signin")) intent = "address";
  // Pure knowledge questions ("what is gas?") are answered, not navigated.
  if (faq && (!intent || ["verify", "ledger", "signin", "blocks", "help"].includes(intent)) && !entities.batchId) intent = "faq";
  return { intent: intent ?? "unknown", entities, faq };
}

/** Edit distance, for "did you mean" suggestions on mistyped batch IDs. */
export function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function closest(id, known, maxDistance = 3) {
  return known
    .map((k) => ({ k, d: distance(id, k) }))
    .filter((x) => x.d <= maxDistance)
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map((x) => x.k);
}

// ───────── Detail extraction for actions ("create batch X, Paracetamol 500mg, 2000 tablets, expiry Dec 2027") ─────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
const endOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0));
const iso = (d) => d.toISOString().slice(0, 10);

/** Parses many date styles into "YYYY-MM-DD" (UTC). Month-only dates mean the end of that month. */
export function parseDate(raw, now = new Date()) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  let m;
  if ((m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return iso(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  if ((m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/))) return iso(new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))); // dd/mm/yyyy (India)
  if ((m = s.match(/\b(\d{1,2})[/.-](\d{4})\b/))) return iso(endOfMonth(+m[2], +m[1] - 1)); // mm/yyyy
  if ((m = s.match(/\b(\d{1,2}) ([a-z]{3,9}) (\d{4})\b/)) && monthIndex(m[2]) >= 0) return iso(new Date(Date.UTC(+m[3], monthIndex(m[2]), +m[1])));
  if ((m = s.match(/\b([a-z]{3,9}) (\d{1,2}) (\d{4})\b/)) && monthIndex(m[1]) >= 0) return iso(new Date(Date.UTC(+m[3], monthIndex(m[1]), +m[2])));
  if ((m = s.match(/\b([a-z]{3,9}) (\d{4})\b/)) && monthIndex(m[1]) >= 0) return iso(endOfMonth(+m[2], monthIndex(m[1])));
  if ((m = s.match(/\bin (\d{1,2}) (year|month|day)s?\b/))) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (m[2] === "year") d.setUTCFullYear(d.getUTCFullYear() + +m[1]);
    if (m[2] === "month") d.setUTCMonth(d.getUTCMonth() + +m[1]);
    if (m[2] === "day") d.setUTCDate(d.getUTCDate() + +m[1]);
    return iso(d);
  }
  if ((m = s.match(/^\s*(\d{4})\s*$/))) return iso(new Date(Date.UTC(+m[1], 11, 31)));
  return null;
}

/** The expiry part of a sentence ("expiring Dec 2027", "exp 31/12/2027", "valid till 2027-12-31"). */
export function extractExpiry(text) {
  const m = text.match(/\b(?:expir\w*|exp\.?|valid (?:till|until)|best before|use by)\s*(?:on|:|date|is)?\s*([^,;]+)/i);
  return m ? parseDate(m[1]) : null;
}

/** "2000 tablets", "qty 500", "quantity: 1,200" -> number. */
export function extractQuantity(text) {
  const m =
    text.match(/\b(?:qty|quantity|units?)\s*(?:of|:|=|is)?\s*(\d[\d,]*)/i) ||
    text.match(/\b(\d[\d,]*)\s*(?:units?|tablets?|tabs?|capsules?|caps?|strips?|boxes|packs?|vials?|bottles?|pcs|pieces|doses?|ampoules?)\b/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** "Paracetamol 500mg" style drug names (word + strength), or a quoted name. */
export function extractDrug(text) {
  const quoted = text.match(/["“']([^"”']{2,100})["”']/);
  if (quoted) return quoted[1].trim();
  const m = text.match(/\b([A-Z][a-zA-Z-]{2,}(?:\s+[A-Za-z][a-zA-Z-]*){0,2}\s+\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%))(?![a-z])/);
  if (m) return m[1].replace(/\s+/g, " ").trim();
  const n = text.match(/\b(?:drug|medicine|of|for)\s+([A-Z][a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)\b/);
  return n && !/batch/i.test(n[1]) ? n[1].trim() : null;
}

/** Role words -> contract role number. */
export function extractRole(text) {
  const t = text.toLowerCase();
  if (/\bmanufactur/.test(t)) return 1;
  if (/\bdistribut/.test(t)) return 2;
  if (/\bpharmac|\bchemist|\bdrug ?store/.test(t)) return 3;
  if (/\bregulat/.test(t)) return 4;
  return null;
}

/** "named Apollo Pharmacy", "called X" -> name; "in Pune" / "at Pune" / "location Pune" -> location. */
export function extractNameLocation(text) {
  const name = text.match(/\b(?:named|called|name is|name:)\s+["“]?([A-Z][\w&.' -]{1,60}?)["”]?(?=\s+(?:in|at|from|located|location)\b|,|\.|$)/i)?.[1]?.trim() ?? null;
  const location = text.match(/\b(?:in|at|from|located in|location)\s+([A-Z][\w .'-]{1,60}?)(?=,|\.|$)/)?.[1]?.trim() ?? null;
  return { name, location };
}

/** "to FastMed", "to the distributor" -> the words naming the receiver. */
export function extractReceiverName(text) {
  return text.match(/\bto\s+(?:the\s+)?([A-Za-z][\w&.' -]{1,60}?)(?=,|\.|$|\s+(?:please|now|today))/i)?.[1]?.trim() ?? null;
}

export const isYes = (t) => /^\s*(y|yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|proceed|please do)\b/i.test(t);
export const isNo = (t) => /^\s*(n|no|nope|cancel|stop|abort|don'?t|never ?mind)\b/i.test(t);
