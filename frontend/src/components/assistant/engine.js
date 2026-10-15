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
  ["approve", /\b(approve|approval|countersign|pending approvals?|reject|step 3|third signature)\b/i],
  ["accept", /\b(accept|receive|incoming|confirm receipt|step 2)\b/i],
  ["send", /\b(send|transfer|hand ?over|hand-?off|ship|dispatch|move (it|the batch))\b/i],
  ["create", /\b(create|register|add|new|make|manufacture)\b.*\bbatch\b|\bbatch\b.*\b(create|register|new)\b/i],
  ["register", /\b(register|add|onboard)\b.*\b(company|participant|pharmacy|distributor|manufacturer|wallet|member)\b/i],
  ["pause", /\b(pause|emergency|freeze|resume|unpause|stop all)\b/i],
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
