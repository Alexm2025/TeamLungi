# MediChain: live demo sheet

Site: **https://alexm2025.github.io/TeamLungi/** (or the local copy at http://localhost:5173)
Blockchain: Hardhat local node at http://127.0.0.1:8545 (chain ID 31337). Real contract, real signed transactions.
Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

## 0. Start the local blockchain (3 terminals, from the repo root)

```
cd contracts && npx hardhat node                          # terminal 1: the blockchain
cd contracts && npm run deploy:local && npm run seed:local  # terminal 2: deploy + demo data
cd contracts && npm run relay                              # terminal 3: lets the GitHub Pages site reach it
```

The public site is built with `VITE_RPC_URL=http://127.0.0.1:8546` (the relay). The first time, Chrome asks to allow access to devices on the local network: click **Allow**.

## 1. MetaMask setup (2 minutes)

1. MetaMask → network selector → **Add network → Add a network manually**:
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
   (Or just click "Connect wallet" on the site: it asks MetaMask to add and switch to it.)
2. Account menu → **Add account → Import account**, then paste each private key below and rename the account.

These are Hardhat's public test keys. They only hold fake ETH on this local chain; never use them elsewhere.

| Rename to | Role | Private key to import |
|---|---|---|
| MediChain Regulator | Admin + Regulator | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Acme Manufacturer | Manufacturer | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| FastMed Distributor | Distributor | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| CityCare Pharmacy | Pharmacy | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

If MetaMask shows a "nonce too high" error after the chain was restarted: Settings → Advanced → **Clear activity tab data**.

## 2. Batches already on-chain

| Batch | State |
|---|---|
| PCM-2026-001 | Full chain → at CityCare Pharmacy (2 handovers, 3/3 signatures each) |
| AMX-2026-014 | At FastMed Distributor |
| IBU-2026-007 | Step 1/3: sent, waiting for the distributor to accept |
| MET-2026-021 | Step 2/3: accepted, **waiting for the regulator** |
| CTZ-2026-003 | **Recalled**: "Failed dissolution test" |

## 3. Demo script (about 5 minutes)

1. **Verify (customer, no wallet):** open `/verify/PCM-2026-001` → GENUINE, custody timeline, and the **Full 3-step verification** (record ✓, 3/3 signatures per handover ✓, lab report).
2. **Recalled batch:** `/verify/CTZ-2026-003` → RECALLED with the on-chain reason.
3. **Public ledger:** `/ledger` → every transaction with its block and signer. Click one for the full receipt and ECDSA signature. Then the **Blocks** tab shows hashes chained by parent hash.
4. **3-signature handover live:**
   - MetaMask → **Acme Manufacturer** → Dashboard → Create batch `DEMO-001` (attach any PDF as the lab report) → Send it to FastMed (the distributor's address is `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`). Signature 1/3.
   - Switch to **FastMed Distributor** → Dashboard → Accept `DEMO-001`. Signature 2/3 (custody still hasn't moved).
   - Switch to **MediChain Regulator** → Dashboard → **Regulator approvals** → Approve. Signature 3/3: custody moves.
   - `/verify/DEMO-001` → drop the same PDF → ✅ fingerprint matches. Drop any other file → ❌.
5. **Recall:** as Regulator, recall `DEMO-001` → the verify page instantly shows RECALLED. Also try sending it as the distributor: blocked by the contract.
6. **Security in code:** `cd contracts && npx hardhat test` → **38 passing**.

## If something breaks

- Site blank or "Can't reach the blockchain": the node terminal was closed. Restart:
  `cd contracts && npx hardhat node`, then in a second terminal `npm run deploy:local && npm run seed:local`.
- Wrong role shown: you're on the wrong MetaMask account; switch accounts and refresh.
