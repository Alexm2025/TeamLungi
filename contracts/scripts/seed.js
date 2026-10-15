// Registers the 3 demo wallets (manufacturer, distributor, pharmacy) on a deployed MedChain.
//   Local:  npm run seed:local  -> uses Hardhat test accounts #1-#3 and also creates demo batches
//   Amoy:   npm run seed:amoy   -> uses DEMO_* addresses from contracts/.env (addresses only, never keys)
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const Role = { Manufacturer: 1, Distributor: 2, Pharmacy: 3 };
const DAY = 24 * 60 * 60;

const DEMO_PARTICIPANTS = [
  { key: "DEMO_MANUFACTURER", role: Role.Manufacturer, name: "Acme Pharma Ltd", location: "Mumbai, MH" },
  { key: "DEMO_DISTRIBUTOR", role: Role.Distributor, name: "FastMed Distributors", location: "Pune, MH" },
  { key: "DEMO_PHARMACY", role: Role.Pharmacy, name: "CityCare Pharmacy", location: "Bengaluru, KA" },
];

function loadContractAddress() {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment for "${network.name}". Run the deploy script first or set CONTRACT_ADDRESS.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")).address;
}

async function main() {
  const isLocal = network.name === "localhost" || network.name === "hardhat";
  const signers = await ethers.getSigners();
  const admin = signers[0];
  const medChain = await ethers.getContractAt("MedChain", loadContractAddress(), admin);
  console.log(`Seeding MedChain at ${await medChain.getAddress()} on ${network.name}\n`);

  // Locally we control accounts #1-#3; on Amoy the addresses come from .env.
  const accounts = DEMO_PARTICIPANTS.map((p, i) => {
    const address = isLocal ? signers[i + 1].address : process.env[p.key];
    if (!address || !ethers.isAddress(address)) {
      throw new Error(`Set ${p.key}=<wallet address> in contracts/.env`);
    }
    return { ...p, address };
  });

  for (const p of accounts) {
    const current = await medChain.participants(p.address);
    // Skip wallets that are already set up, so the script is safe to run twice.
    if (current.active && Number(current.role) === p.role && current.name === p.name) {
      console.log(`= ${p.name} already registered (${p.address})`);
      continue;
    }
    await (await medChain.registerParticipant(p.address, p.role, p.name, p.location)).wait();
    console.log(`+ Registered ${p.name} as role ${p.role} (${p.address})`);
  }

  // Optional: send each demo wallet some gas money (FUND_DEMO_WALLETS=0.002 in .env) so they can sign right away.
  const fundAmount = process.env.FUND_DEMO_WALLETS;
  if (!isLocal && fundAmount) {
    const value = ethers.parseEther(fundAmount);
    for (const p of accounts) {
      const balance = await ethers.provider.getBalance(p.address);
      if (balance >= value) {
        console.log(`= ${p.name} already has ${ethers.formatEther(balance)}`);
        continue;
      }
      await (await admin.sendTransaction({ to: p.address, value: value - balance })).wait();
      console.log(`+ Topped up ${p.name} to ${fundAmount}`);
    }
  }

  if (isLocal) await seedLocalBatches(medChain, signers);
  console.log("\nDone.");
}

// Demo data for local runs: one batch at each stage, plus a recalled one.
async function seedLocalBatches(medChain, [admin, manufacturer, distributor, pharmacy]) {
  if ((await medChain.totalBatches()) > 0n) {
    console.log("= Demo batches already exist, skipping");
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const asM = medChain.connect(manufacturer);
  const asD = medChain.connect(distributor);
  const asP = medChain.connect(pharmacy);
  const create = async (id, drug, qty) =>
    (await asM.createBatch(id, drug, now, now + 365 * DAY, qty, ethers.id(`lab-report-${id}`))).wait();
  const send = async (from, id, to) => (await from.initiateTransfer(id, to.address)).wait();
  const accept = async (as, id) => (await as.acceptTransfer(id)).wait();
  const approve = async (id) => (await medChain.connect(admin).approveTransfer(id)).wait();
  // All 3 signatures: sender, receiver, regulator
  const handover = async (from, id, to, asTo) => {
    await send(from, id, to);
    await accept(asTo, id);
    await approve(id);
  };

  await create("PCM-2026-001", "Paracetamol 500mg", 5000); // full chain -> pharmacy
  await handover(asM, "PCM-2026-001", distributor, asD);
  await handover(asD, "PCM-2026-001", pharmacy, asP);

  await create("AMX-2026-014", "Amoxicillin 250mg", 2000); // at distributor
  await handover(asM, "AMX-2026-014", distributor, asD);

  await create("IBU-2026-007", "Ibuprofen 400mg", 3000); // step 1 done: in transit
  await send(asM, "IBU-2026-007", distributor);

  await create("MET-2026-021", "Metformin 500mg", 4000); // steps 1-2 done: awaiting regulator
  await send(asM, "MET-2026-021", distributor);
  await accept(asD, "MET-2026-021");

  await create("CTZ-2026-003", "Cetirizine 10mg", 1500); // recalled by regulator
  await (await medChain.connect(admin).recallBatch("CTZ-2026-003", "Failed dissolution test")).wait();

  console.log("+ Created demo batches: PCM-2026-001 (at pharmacy), AMX-2026-014 (at distributor),");
  console.log("  IBU-2026-007 (in transit), MET-2026-021 (awaiting regulator approval), CTZ-2026-003 (recalled)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
