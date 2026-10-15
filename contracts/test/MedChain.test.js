const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Mirror the enums in MedChain.sol
const Role = { None: 0, Manufacturer: 1, Distributor: 2, Pharmacy: 3, Regulator: 4 };
const Status = { Created: 0, InTransit: 1, AtDistributor: 2, AtPharmacy: 3, Recalled: 4, AwaitingApproval: 5 };

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

  // Full 3-signature handover: sender initiates, receiver accepts, regulator (admin) approves.
  async function handover(medChain, admin, from, to, batchId = BATCH_ID) {
    await medChain.connect(from).initiateTransfer(batchId, to.address);
    await medChain.connect(to).acceptTransfer(batchId);
    await medChain.connect(admin).approveTransfer(batchId);
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
    it("moves custody only after all 3 signatures: initiate, accept, regulator approve", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);

      // Step 1: sender initiates
      await expect(medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address))
        .to.emit(medChain, "TransferInitiated")
        .withArgs(BATCH_ID, manufacturer.address, distributor.address);
      let b = await medChain.getBatch(BATCH_ID);
      expect(b.status).to.equal(Status.InTransit);
      expect(b.currentOwner).to.equal(manufacturer.address);
      expect(b.pendingReceiver).to.equal(distributor.address);

      // Step 2: receiver accepts, but custody still hasn't moved
      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID))
        .to.emit(medChain, "TransferAccepted")
        .withArgs(BATCH_ID, manufacturer.address, distributor.address);
      b = await medChain.getBatch(BATCH_ID);
      expect(b.status).to.equal(Status.AwaitingApproval);
      expect(b.receiverAccepted).to.be.true;
      expect(b.currentOwner).to.equal(manufacturer.address);
      expect((await medChain.getHistory(BATCH_ID)).length).to.equal(1);

      // Step 3: regulator approves, and custody moves
      await expect(medChain.connect(admin).approveTransfer(BATCH_ID))
        .to.emit(medChain, "TransferApproved")
        .withArgs(BATCH_ID, manufacturer.address, distributor.address, admin.address);
      b = await medChain.getBatch(BATCH_ID);
      expect(b.currentOwner).to.equal(distributor.address);
      expect(b.pendingReceiver).to.equal(ethers.ZeroAddress);
      expect(b.receiverAccepted).to.be.false;
      expect(b.status).to.equal(Status.AtDistributor);

      const history = await medChain.getHistory(BATCH_ID);
      expect(history.length).to.equal(2);
      expect(history[1].from).to.equal(manufacturer.address);
      expect(history[1].to).to.equal(distributor.address);
      expect(history[1].location).to.equal("Pune");
      expect(history[1].approvedBy).to.equal(admin.address);
      expect(history[0].approvedBy).to.equal(ethers.ZeroAddress); // creation entry
    });

    it("rejects approval by anyone who isn't the regulator", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);

      // Neither party to the handover can sign the third step themselves.
      await expect(medChain.connect(distributor).approveTransfer(BATCH_ID)).to.be.revertedWith("Wrong role");
      await expect(medChain.connect(manufacturer).approveTransfer(BATCH_ID)).to.be.revertedWith("Wrong role");
    });

    it("rejects approval before the receiver has accepted, or with nothing pending", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);

      await expect(medChain.connect(admin).approveTransfer(BATCH_ID)).to.be.revertedWith("Nothing pending");
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await expect(medChain.connect(admin).approveTransfer(BATCH_ID)).to.be.revertedWith(
        "Receiver has not accepted"
      );
    });

    it("rejects a second accept for the same pending transfer", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);

      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID)).to.be.revertedWith("Already accepted");
    });

    it("lets the regulator reject a handover, leaving the batch with the sender", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);

      await expect(medChain.connect(admin).rejectTransfer(BATCH_ID, ""), "empty reason").to.be.revertedWith(
        "Reason required"
      );
      await expect(medChain.connect(admin).rejectTransfer(BATCH_ID, "Invoice mismatch"))
        .to.emit(medChain, "TransferRejected")
        .withArgs(BATCH_ID, admin.address, "Invoice mismatch");

      const b = await medChain.getBatch(BATCH_ID);
      expect(b.currentOwner).to.equal(manufacturer.address);
      expect(b.pendingReceiver).to.equal(ethers.ZeroAddress);
      expect(b.receiverAccepted).to.be.false;
      expect(b.status).to.equal(Status.Created);
      expect((await medChain.getHistory(BATCH_ID)).length).to.equal(1);
    });

    it("rejects rejectTransfer from non-regulators", async function () {
      const { medChain, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);

      await expect(medChain.connect(distributor).rejectTransfer(BATCH_ID, "no")).to.be.revertedWith("Wrong role");
    });

    it("blocks approval if the receiver was deactivated after accepting", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);
      await medChain.connect(admin).deactivateParticipant(distributor.address);

      await expect(medChain.connect(admin).approveTransfer(BATCH_ID)).to.be.revertedWith("Receiver inactive");
    });

    it("completes the full manufacturer -> distributor -> pharmacy chain", async function () {
      const { medChain, admin, manufacturer, distributor, pharmacy } = await loadFixture(withBatchFixture);

      await handover(medChain, admin, manufacturer, distributor);
      await handover(medChain, admin, distributor, pharmacy);

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

    it("lets the owner cancel even after the receiver accepted, until the regulator approves", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);
      await medChain.connect(manufacturer).cancelTransfer(BATCH_ID);

      const b = await medChain.getBatch(BATCH_ID);
      expect(b.receiverAccepted).to.be.false;
      expect(b.status).to.equal(Status.Created);
      await expect(medChain.connect(admin).approveTransfer(BATCH_ID)).to.be.revertedWith("Nothing pending");
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

    it("blocks regulator approval of a handover that was accepted before the recall", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);
      await medChain.connect(distributor).acceptTransfer(BATCH_ID);
      await medChain.connect(admin).recallBatch(BATCH_ID, "Contamination");

      await expect(medChain.connect(admin).approveTransfer(BATCH_ID)).to.be.revertedWith("Batch recalled");
      expect((await medChain.getBatch(BATCH_ID)).currentOwner).to.equal(manufacturer.address);
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
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await handover(medChain, admin, manufacturer, distributor);

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

  describe("Security & administration", function () {
    it("pause freezes creation and every handover step, but recalls still work", async function () {
      const { medChain, admin, manufacturer, distributor } = await loadFixture(withBatchFixture);
      await medChain.connect(manufacturer).initiateTransfer(BATCH_ID, distributor.address);

      await expect(medChain.connect(admin).pause()).to.emit(medChain, "Paused").withArgs(admin.address);
      const now = await time.latest();
      await expect(
        medChain.connect(manufacturer).createBatch("B-2", "Drug", now, now + DAY, 1, ethers.ZeroHash)
      ).to.be.revertedWith("Paused");
      await expect(medChain.connect(distributor).acceptTransfer(BATCH_ID)).to.be.revertedWith("Paused");

      // Safety actions are never blocked.
      await expect(medChain.connect(admin).recallBatch(BATCH_ID, "Emergency")).to.emit(medChain, "BatchRecalled");

      await expect(medChain.connect(admin).unpause()).to.emit(medChain, "Unpaused");
      expect(await medChain.paused()).to.be.false;
    });

    it("only the admin can pause or unpause", async function () {
      const { medChain, manufacturer } = await loadFixture(deployWithParticipantsFixture);
      await expect(medChain.connect(manufacturer).pause()).to.be.revertedWith("Only admin");
      await expect(medChain.unpause()).to.be.revertedWith("Not paused");
    });

    it("moves admin rights in two steps, and only to the proposed address", async function () {
      const { medChain, admin, manufacturer, outsider } = await loadFixture(deployWithParticipantsFixture);

      await expect(medChain.connect(manufacturer).proposeAdmin(outsider.address)).to.be.revertedWith("Only admin");
      await expect(medChain.proposeAdmin(outsider.address))
        .to.emit(medChain, "AdminTransferStarted")
        .withArgs(admin.address, outsider.address);
      expect(await medChain.admin()).to.equal(admin.address); // nothing changes until accepted

      await expect(medChain.connect(manufacturer).acceptAdmin()).to.be.revertedWith("Not proposed admin");
      await expect(medChain.connect(outsider).acceptAdmin())
        .to.emit(medChain, "AdminTransferred")
        .withArgs(admin.address, outsider.address);
      expect(await medChain.admin()).to.equal(outsider.address);
      expect(await medChain.pendingAdmin()).to.equal(ethers.ZeroAddress);
      await expect(medChain.connect(admin).pause()).to.be.revertedWith("Only admin");
    });

    it("validates batch and participant inputs", async function () {
      const { medChain, manufacturer, outsider } = await loadFixture(deployWithParticipantsFixture);
      const now = await time.latest();
      const create = (id, drug, mfg, exp) =>
        medChain.connect(manufacturer).createBatch(id, drug, mfg, exp, 1, ethers.ZeroHash);

      await expect(create("", "Drug", now, now + DAY)).to.be.revertedWith("Batch ID 1-64 chars");
      await expect(create("X".repeat(65), "Drug", now, now + DAY)).to.be.revertedWith("Batch ID 1-64 chars");
      await expect(create("B-1", "", now, now + DAY)).to.be.revertedWith("Drug name 1-100 chars");
      await expect(create("B-1", "Drug", now - 3 * DAY, now - DAY)).to.be.revertedWith("Already expired");
      await expect(medChain.registerParticipant(outsider.address, Role.Pharmacy, "", "X")).to.be.revertedWith(
        "Name 1-100 chars"
      );
    });

    it("rejects deactivating an account that isn't active", async function () {
      const { medChain, distributor, outsider } = await loadFixture(deployWithParticipantsFixture);
      await medChain.deactivateParticipant(distributor.address);
      await expect(medChain.deactivateParticipant(distributor.address)).to.be.revertedWith("Not active");
      await expect(medChain.deactivateParticipant(outsider.address)).to.be.revertedWith("Not active");
    });

    it("lists every batch by index", async function () {
      const { medChain, manufacturer } = await loadFixture(withBatchFixture);
      const now = await time.latest();
      await medChain.connect(manufacturer).createBatch("B-2", "Drug", now, now + DAY, 1, ethers.ZeroHash);

      expect(await medChain.batchIdAt(0)).to.equal(BATCH_ID);
      expect(await medChain.batchIdAt(1)).to.equal("B-2");
      await expect(medChain.batchIdAt(2)).to.be.revertedWith("Index out of range");
    });
  });
});
