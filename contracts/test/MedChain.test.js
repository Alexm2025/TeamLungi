const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Mirror the enums in MedChain.sol
const Role = { None: 0, Manufacturer: 1, Distributor: 2, Pharmacy: 3, Regulator: 4 };
const Status = { Created: 0, InTransit: 1, AtDistributor: 2, AtPharmacy: 3, Recalled: 4 };

const DAY = 24 * 60 * 60;
const BATCH_ID = "BATCH-001";

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

  // Same as above plus one batch created by the manufacturer, valid for a year from chain time.
  async function withBatchFixture() {
    const ctx = await deployWithParticipantsFixture();
    const now = await time.latest();
    const expiry = now + 365 * DAY;
    await ctx.medChain
      .connect(ctx.manufacturer)
      .createBatch(BATCH_ID, "Paracetamol 500mg", now, expiry, 1000, ethers.id("lab-report-v1"));
    return { ...ctx, expiry };
  }

  describe("Participants", function () {
    it("makes the deployer admin and registers them as Regulator", async function () {
      const { medChain, admin } = await loadFixture(deployWithParticipantsFixture);

      expect(await medChain.admin()).to.equal(admin.address);
      const p = await medChain.participants(admin.address);
      expect(p.role).to.equal(Role.Regulator);
      expect(p.active).to.be.true;
    });

    it("lets admin register participants with role, name and location", async function () {
      const { medChain, outsider } = await loadFixture(deployWithParticipantsFixture);

      await expect(medChain.registerParticipant(outsider.address, Role.Distributor, "New Dist", "Delhi"))
        .to.emit(medChain, "ParticipantRegistered")
        .withArgs(outsider.address, Role.Distributor, "New Dist");

      const p = await medChain.participants(outsider.address);
      expect(p.role).to.equal(Role.Distributor);
      expect(p.name).to.equal("New Dist");
      expect(p.location).to.equal("Delhi");
      expect(p.active).to.be.true;
    });

    it("rejects registration by non-admin, with zero address, or with Role.None", async function () {
      const { medChain, manufacturer, outsider } = await loadFixture(deployWithParticipantsFixture);

      await expect(
        medChain.connect(manufacturer).registerParticipant(outsider.address, Role.Pharmacy, "X", "Y")
      ).to.be.revertedWith("Only admin");
      await expect(
        medChain.registerParticipant(ethers.ZeroAddress, Role.Pharmacy, "X", "Y")
      ).to.be.revertedWith("Zero address");
      await expect(
        medChain.registerParticipant(outsider.address, Role.None, "X", "Y")
      ).to.be.revertedWith("Invalid role");
    });
  });

  describe("Batch creation", function () {
    it("lets a manufacturer create a batch and records the first custody entry", async function () {
      const { medChain, manufacturer, expiry } = await loadFixture(withBatchFixture);

      const b = await medChain.getBatch(BATCH_ID);
      expect(b.drugName).to.equal("Paracetamol 500mg");
      expect(b.manufacturer).to.equal(manufacturer.address);
      expect(b.currentOwner).to.equal(manufacturer.address);
      expect(b.expiryDate).to.equal(expiry);
      expect(b.quantity).to.equal(1000);
      expect(b.docHash).to.equal(ethers.id("lab-report-v1"));
      expect(b.status).to.equal(Status.Created);
      expect(await medChain.totalBatches()).to.equal(1);

      // Creation is history entry #0, coming "from" the zero address.
      const history = await medChain.getHistory(BATCH_ID);
      expect(history.length).to.equal(1);
      expect(history[0].from).to.equal(ethers.ZeroAddress);
      expect(history[0].to).to.equal(manufacturer.address);
      expect(history[0].location).to.equal("Mumbai");
    });

    it("emits BatchCreated", async function () {
      const { medChain, manufacturer } = await loadFixture(deployWithParticipantsFixture);
      const now = await time.latest();

      await expect(
        medChain.connect(manufacturer).createBatch("BATCH-002", "Amoxicillin", now, now + DAY, 50, ethers.ZeroHash)
      )
        .to.emit(medChain, "BatchCreated")
        .withArgs("BATCH-002", "Amoxicillin", manufacturer.address);
    });

    it("rejects a duplicate batch ID", async function () {
      const { medChain, manufacturer } = await loadFixture(withBatchFixture);
      const now = await time.latest();

      await expect(
        medChain.connect(manufacturer).createBatch(BATCH_ID, "Other drug", now, now + DAY, 1, ethers.ZeroHash)
      ).to.be.revertedWith("Batch ID already used");
    });

    it("rejects batch creation by non-manufacturers and invalid inputs", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(deployWithParticipantsFixture);
      const now = await time.latest();

      await expect(
        medChain.connect(distributor).createBatch("B-X", "Drug", now, now + DAY, 1, ethers.ZeroHash)
      ).to.be.revertedWith("Wrong role");
      await expect(
        medChain.connect(manufacturer).createBatch("B-X", "Drug", now, now - DAY, 1, ethers.ZeroHash)
      ).to.be.revertedWith("Expiry before mfg");
      await expect(
        medChain.connect(manufacturer).createBatch("B-X", "Drug", now, now + DAY, 0, ethers.ZeroHash)
      ).to.be.revertedWith("Quantity 0");
    });
  });

  describe("Transfers", function () {
    it("initiateTransfer + acceptTransfer moves custody and adds history", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);

      await expect(medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address))
        .to.emit(medChain, "TransferInitiated")
        .withArgs(BATCH_ID, manufacturer.address, distributor.address);

      // Two-step handover: owner doesn't change until the receiver accepts.
      let b = await medChain.getBatch(BATCH_ID);
      expect(b.status).to.equal(Status.InTransit);
      expect(b.currentOwner).to.equal(manufacturer.address);
      expect(b.pendingReceiver).to.equal(distributor.address);

      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID))
        .to.emit(medChain, "TransferAccepted")
        .withArgs(BATCH_ID, manufacturer.address, distributor.address);

      b = await medChain.getBatch(BATCH_ID);
      expect(b.currentOwner).to.equal(distributor.address);
      expect(b.pendingReceiver).to.equal(ethers.ZeroAddress);
      expect(b.status).to.equal(Status.AtDistributor);

      const history = await medChain.getHistory(BATCH_ID);
      expect(history.length).to.equal(2);
      expect(history[1].from).to.equal(manufacturer.address);
      expect(history[1].to).to.equal(distributor.address);
      expect(history[1].location).to.equal("Pune");
    });

    it("completes the full manufacturer -> distributor -> pharmacy chain", async function () {
      const { medChain, manufacturer, distributor, pharmacy } = await loadFixture(withBatchFixture);

      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);
      await medChain.connect(distributor).initiateTransfer(BATCH_ID, pharmacy.address);
      await medChain.connect(pharmacy).acceptTransfer(BATCH_ID);

      const b = await medChain.getBatch(BATCH_ID);
      expect(b.currentOwner).to.equal(pharmacy.address);
      expect(b.status).to.equal(Status.AtPharmacy);
      expect((await medChain.getHistory(BATCH_ID)).length).to.equal(3);
    });

    it("rejects an invalid hop (manufacturer -> pharmacy)", async function () {
      const { medChain, manufacturer, pharmacy } = await loadFixture(withBatchFixture);

      await expect(
        medChain.connect(manufacturer).initiateTransfer(BATCH_ID, pharmacy.address)
      ).to.be.revertedWith("Invalid supply-chain hop");
    });

    it("rejects a transfer to an unregistered address", async function () {
      const { medChain, manufacturer, outsider } = await loadFixture(withBatchFixture);

      await expect(
        medChain.connect(manufacturer).initiateTransfer(BATCH_ID, outsider.address)
      ).to.be.revertedWith("Receiver not registered");
    });

    it("rejects a transfer initiated by someone who doesn't own the batch", async function () {
      const { medChain, distributor, pharmacy } = await loadFixture(withBatchFixture);

      await expect(
        medChain.connect(distributor).initiateTransfer(BATCH_ID, pharmacy.address)
      ).to.be.revertedWith("Not current owner");
    });

    it("rejects acceptTransfer from anyone but the pending receiver", async function () {
      const { medChain, manufacturer, distributor, pharmacy } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);

      await expect(medChain.connect(pharmacy).acceptTransfer(BATCH_ID)).to.be.revertedWith(
        "Not the pending receiver"
      );
    });

    it("rejects a second initiate while a transfer is pending", async function () {
      const { medChain, admin, manufacturer, distributor, outsider } = await loadFixture(withBatchFixture);
      await medChain.connect(admin).registerParticipant(outsider.address, Role.Distributor, "Dist 2", "Goa");
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);

      await expect(
        medChain.connect(manufacturer).initiateTransfer(BATCH_ID, outsider.address)
      ).to.be.revertedWith("Transfer already pending");
    });

    it("lets the owner cancel a pending transfer", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);

      await expect(medChain.connect(manufacturer).cancelTransfer(BATCH_ID))
        .to.emit(medChain, "TransferCancelled")
        .withArgs(BATCH_ID, manufacturer.address);

      const b = await medChain.getBatch(BATCH_ID);
      expect(b.pendingReceiver).to.equal(ethers.ZeroAddress);
      expect(b.status).to.equal(Status.Created);
      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID)).to.be.revertedWith(
        "Not the pending receiver"
      );
    });

    it("rejects acceptTransfer from a receiver deactivated after the transfer started", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);

      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.deactivateParticipant(distributor.address);

      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID)).to.be.revertedWith("Receiver inactive");
      expect((await medChain.getBatch(BATCH_ID)).currentOwner).to.equal(manufacturer.address);
    });

    it("reverts with 'Batch not found' for unknown batch IDs", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);

      await expect(
        medChain.connect(manufacturer).initiateTransfer("NOPE", distributor.address)
      ).to.be.revertedWith("Batch not found");
      await expect(medChain.getBatch("NOPE")).to.be.revertedWith("Batch not found");
    });
  });

  describe("Recall", function () {
    it("lets the regulator recall a batch and stores the reason", async function () {
      const { medChain, admin } = await loadFixture(withBatchFixture);

      await expect(medChain.connect(admin).recallBatch(BATCH_ID, "Contamination"))
        .to.emit(medChain, "BatchRecalled")
        .withArgs(BATCH_ID, "Contamination", admin.address);

      expect((await medChain.getBatch(BATCH_ID)).status).to.equal(Status.Recalled);
      // recallReason is keyed by keccak256(batchId), the same key the contract uses internally.
      expect(await medChain.recallReason(ethers.id(BATCH_ID))).to.equal("Contamination");
    });

    it("blocks new transfers and pending accepts after a recall", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);

      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(manufacturer).recallBatch(BATCH_ID, "Failed QC");

      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID)).to.be.revertedWith("Batch recalled");
      await expect(
        medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address)
      ).to.be.revertedWith("Batch recalled");
      await expect(medChain.connect(admin).recallBatch(BATCH_ID, "again")).to.be.revertedWith("Already recalled");
    });

    it("rejects recall by anyone other than the regulator or the batch's manufacturer", async function () {
      const { medChain, distributor } = await loadFixture(withBatchFixture);

      await expect(medChain.connect(distributor).recallBatch(BATCH_ID, "nope")).to.be.revertedWith(
        "Not allowed to recall"
      );
    });
  });

  describe("verifyBatch", function () {
    it("returns exists=false and empty values for an unknown batch", async function () {
      const { medChain } = await loadFixture(withBatchFixture);

      const v = await medChain.verifyBatch("UNKNOWN");
      expect(v.exists).to.be.false;
      expect(v.recalled).to.be.false;
      expect(v.expired).to.be.false;
      expect(v.drugName).to.equal("");
      expect(v.hops).to.equal(0);
    });

    it("returns correct flags, names and hop count for a genuine batch", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);

      const v = await medChain.verifyBatch(BATCH_ID);
      expect(v.exists).to.be.true;
      expect(v.recalled).to.be.false;
      expect(v.expired).to.be.false;
      expect(v.drugName).to.equal("Paracetamol 500mg");
      expect(v.manufacturerName).to.equal("Acme Pharma");
      expect(v.currentHolder).to.equal("FastMed Logistics");
      expect(v.hops).to.equal(2);
    });

    it("flags recalled batches", async function () {
      const { medChain, admin } = await loadFixture(withBatchFixture);
      await medChain.connect(admin).recallBatch(BATCH_ID, "Contamination");

      const v = await medChain.verifyBatch(BATCH_ID);
      expect(v.exists).to.be.true;
      expect(v.recalled).to.be.true;
    });

    it("flags expired batches once chain time passes the expiry date", async function () {
      const { medChain, expiry } = await loadFixture(withBatchFixture);

      expect((await medChain.verifyBatch(BATCH_ID)).expired).to.be.false;
      // Jump the local chain's clock past the expiry; verifyBatch is a view, so it reads the new block time.
      await time.increaseTo(expiry + 1);
      expect((await medChain.verifyBatch(BATCH_ID)).expired).to.be.true;
    });
  });
});
