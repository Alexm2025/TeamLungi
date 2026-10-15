const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Mirrors the Role enum in MedChain.sol
const Role = { None: 0, Manufacturer: 1, Distributor: 2, Pharmacy: 3, Regulator: 4 };

const DAY = 24 * 60 * 60;

describe("MedChain", function () {
  // Deploys once, then loadFixture snapshots the chain and reverts to it for each test.
  async function deployWithParticipantsFixture() {
    const [admin, manufacturer, distributor, pharmacy, outsider] = await ethers.getSigners();
    const medChain = await ethers.deployContract("MedChain");

    await medChain.registerParticipant(manufacturer.address, Role.Manufacturer, "Acme Pharma", "Mumbai");
    await medChain.registerParticipant(distributor.address, Role.Distributor, "FastMed Logistics", "Pune");
    await medChain.registerParticipant(pharmacy.address, Role.Pharmacy, "City Pharmacy", "Bengaluru");

    return { medChain, admin, manufacturer, distributor, pharmacy, outsider };
  }

  async function createBatch(medChain, manufacturer, batchId = "BATCH-001") {
    const now = Math.floor(Date.now() / 1000);
    await medChain
      .connect(manufacturer)
      .createBatch(batchId, "Paracetamol 500mg", now, now + 365 * DAY, 1000, ethers.ZeroHash);
    return batchId;
  }

  describe("Transfers", function () {
    it("rejects acceptTransfer from a receiver deactivated after the transfer started", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(deployWithParticipantsFixture);
      const batchId = await createBatch(medChain, manufacturer);

      await medChain.connect(manufacturer).initiateTransfer(batchId, distributor.address);
      await medChain.deactivateParticipant(distributor.address);

      await expect(medChain.connect(distributor).acceptTransfer(batchId)).to.be.revertedWith("Receiver inactive");
      expect((await medChain.getBatch(batchId)).currentOwner).to.equal(manufacturer.address);
    });
  });
});
