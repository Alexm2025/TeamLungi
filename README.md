# MediChain – Medicine Batch Tracking on Blockchain

[![Winner: HACK ON TRACK 2026](https://img.shields.io/badge/%F0%9F%8F%86%20Winner-HACK%20ON%20TRACK%202026-gold?style=for-the-badge)](#)
[![Live demo](https://img.shields.io/badge/Live%20demo-Sepolia-blue?style=for-the-badge)](https://alexm2025.github.io/TeamLungi/)

A blockchain platform that tracks medicine batches from manufacturers through distributors to pharmacies, so anyone can verify a batch's origin and full custody history.

> 🏆 **Winner of HACK ON TRACK 2026**, a 24-hour hackathon (15–16 Oct 2026). Built by Team Lungi.

## The problem

Counterfeit and substandard medicines are a serious public-health risk. Once a box leaves the factory, a patient or pharmacist has no reliable way to check:

- whether the batch was really made by the manufacturer printed on the box,
- who handled it on the way, and
- whether it has since been **recalled** or has **expired**.

Paper records and private databases can be edited, lost or faked, and every company in the chain keeps its own.

## Our solution

MediChain records every batch and every change of custody on a public blockchain (Polygon Amoy testnet):

1. A **manufacturer** registers a batch (drug, dates, quantity, lab-report hash) and prints a **QR code** on the box.
2. Each handover (manufacturer → distributor → pharmacy) is a **two-step transfer**: the sender initiates it and the receiver accepts it, so custody can't be pushed onto someone without their confirmation.
3. A **regulator** can recall a batch with a reason.
4. **Anyone** can scan the QR code or type the batch ID to see a clear verdict (**Genuine / Recalled / Expired / Not found**) and the full custody timeline. No wallet, no sign-up and no fees are needed.

Because the records live on-chain, no single party can quietly change or delete them.

## Architecture

```
┌────────────────────────┐      ┌────────────────────────┐      ┌─────────────────────────────┐
│ Smart contract         │      │ frontend/src/lib/      │      │ frontend/src/pages/         │
│ (Solidity, Polygon     │ ───▶ │ contract.js            │ ───▶ │ dashboard/ (participants)   │
│  Amoy)                 │      │ ABI + ethers v6 helper │      │ verify/    (public)         │
└────────────────────────┘      └────────────────────────┘      └─────────────────────────────┘
```

- **contracts/** stores batches, participants, custody history and recalls.
- **frontend/src/lib/contract.js** wraps the contract with ethers v6. `getContract()` without a signer gives a read-only connection through a public RPC, which is what the verify page uses. Dashboards connect MetaMask to sign transactions.
- **frontend/src/pages/** has the role dashboards and the public verify page (`/verify` and `/verify/:batchId`).

More detail and diagrams are in [docs/architecture.md](docs/architecture.md).

## Roles and custody flow

| Role | Can do |
|---|---|
| Admin (contract deployer) | Register and deactivate participants; also starts as a Regulator |
| Manufacturer | Create batches, start transfers to distributors, recall its own batches |
| Distributor | Accept batches, start transfers to other distributors or pharmacies |
| Pharmacy | Accept batches (final holder before sale) |
| Regulator | Recall any batch with a reason |
| Customer (anyone) | Verify a batch by QR scan or ID: free, with no wallet |

Batch status: `Created → InTransit → AtDistributor → InTransit → AtPharmacy`. A sender can cancel a pending transfer, and `Recalled` can happen at any point.

## Tech stack

- **Smart contract:** Solidity, Hardhat
- **Blockchain:** Polygon Amoy testnet
- **Frontend:** React + Vite, React Router, ethers v6
- **QR codes:** `qrcode.react` (generate), `html5-qrcode` (scan with camera)
- **Wallet:** MetaMask (participants only; customers don't need one)

## Getting started

Requirements: Node.js 18+ and npm. MetaMask is only needed for the participant dashboards.

### Smart contract

```bash
cd contracts
npm install
npx hardhat test
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173/verify. Camera scanning works on `localhost` or over HTTPS. Until a contract address is configured, the verify page runs in demo mode with sample batches (`PCM-2026-001`, `AMX-2026-014`, `IBU-2024-007`).

To point the frontend at a deployed contract, create `frontend/.env`:

```
VITE_CONTRACT_ADDRESS=0xYourDeployedAddress
```

### Live demo

Every push to `main` deploys the frontend to https://alexm2025.github.io/TeamLungi/ (contract address from the `VITE_CONTRACT_ADDRESS` repository variable).

### Deployed contract

| Network | Address |
|---|---|
| Polygon Amoy | `TBD – will be added after deployment` |

## Repository layout

```
contracts/                    Solidity smart contract + Hardhat tests
frontend/src/lib/             Contract wrapper (ABI, provider, signer)
frontend/src/pages/dashboard/ Participant dashboards
frontend/src/pages/verify/    Public batch verification page
frontend/src/components/qr/   QR label generator and camera scanner
backend/                      Scan logging for counterfeit detection
docs/                         Architecture and pitch material
```

## Team

| Member | GitHub | Area |
|---|---|---|
| A | [@Alexm2025](https://github.com/Alexm2025) | Smart contract, tests, deployment, contract wrapper |
| B | [@shreashetty17](https://github.com/shreashetty17) | App shell, routing, dashboards (Admin, Manufacturer, Distributor, Pharmacy) |
| C | [@ErwinSamuel2906](https://github.com/ErwinSamuel2906) | Verification page, QR codes, backend, docs |
