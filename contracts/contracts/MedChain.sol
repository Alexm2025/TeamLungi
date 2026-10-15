// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MedChain — medicine batch tracking from manufacturer → distributor → pharmacy.
 *
 * Key ideas:
 *  - Only registered participants (with a role) can act.
 *  - Custody changes need THREE signatures: sender initiates, receiver accepts,
 *    regulator approves. Only the third signature moves custody.
 *  - Every handover is stored with who approved it, so anyone can see the full chain of custody.
 *  - Regulator (or the batch's manufacturer) can recall a batch.
 *  - verifyBatch() is a free read call used by the public QR-scan page.
 */
contract MedChain {
    // ───────────────────────── Types ─────────────────────────
    enum Role { None, Manufacturer, Distributor, Pharmacy, Regulator }
    // New values are appended so existing numbers (used by the frontend) don't change.
    enum Status { Created, InTransit, AtDistributor, AtPharmacy, Recalled, AwaitingApproval }

    struct Participant {
        Role role;
        string name;
        string location;
        bool active;
    }

    struct Batch {
        string batchId;
        string drugName;
        address manufacturer;
        uint256 mfgDate;      // unix timestamp
        uint256 expiryDate;   // unix timestamp
        uint256 quantity;
        bytes32 docHash;      // hash of lab / quality certificate (file kept off-chain, e.g. IPFS)
        address currentOwner;
        address pendingReceiver;
        Status status;
        uint256 createdAt;
        bool exists;
        bool receiverAccepted; // step 2 of the pending handover is done
    }

    struct Handover {
        address from;
        address to;
        uint256 timestamp;
        string location;
        address approvedBy;    // regulator who signed step 3 (zero for the creation entry)
    }

    // ───────────────────────── Storage ─────────────────────────
    address public admin;
    address public pendingAdmin;   // two-step admin handover: proposed, then accepted
    bool public paused;            // emergency stop for supply-chain actions (recalls still allowed)
    mapping(address => Participant) public participants;
    mapping(bytes32 => Batch) private batches;          // key = keccak256(batchId)
    mapping(bytes32 => Handover[]) private history;
    mapping(bytes32 => string) public recallReason;
    bytes32[] private allBatchKeys;

    // ───────────────────────── Events ─────────────────────────
    event ParticipantRegistered(address indexed account, Role role, string name);
    event ParticipantDeactivated(address indexed account);
    event BatchCreated(string batchId, string drugName, address indexed manufacturer);
    event TransferInitiated(string batchId, address indexed from, address indexed to);
    event TransferAccepted(string batchId, address indexed from, address indexed to);
    event TransferApproved(string batchId, address indexed from, address indexed to, address indexed regulator);
    event TransferRejected(string batchId, address indexed by, string reason);
    event TransferCancelled(string batchId, address indexed by);
    event BatchRecalled(string batchId, string reason, address indexed by);
    event AdminTransferStarted(address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ───────────────────────── Modifiers ─────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier onlyRole(Role r) {
        require(participants[msg.sender].active && participants[msg.sender].role == r, "Wrong role");
        _;
    }

    modifier batchExists(string memory batchId) {
        require(batches[_key(batchId)].exists, "Batch not found");
        _;
    }

    constructor() {
        admin = msg.sender;
        participants[msg.sender] = Participant(Role.Regulator, "Regulator", "HQ", true);
        emit ParticipantRegistered(msg.sender, Role.Regulator, "Regulator");
    }

    // ───────────────────────── Participants ─────────────────────────
    function registerParticipant(
        address account,
        Role role,
        string calldata name,
        string calldata location
    ) external onlyAdmin {
        require(account != address(0), "Zero address");
        require(role != Role.None, "Invalid role");
        require(bytes(name).length > 0 && bytes(name).length <= 100, "Name 1-100 chars");
        require(bytes(location).length <= 100, "Location max 100 chars");
        participants[account] = Participant(role, name, location, true);
        emit ParticipantRegistered(account, role, name);
    }

    function deactivateParticipant(address account) external onlyAdmin {
        require(participants[account].active, "Not active");
        participants[account].active = false;
        emit ParticipantDeactivated(account);
    }

    // ───────────────────────── Admin / emergency ─────────────────────────
    /// Step 1 of moving admin rights (e.g. to a multisig). Nothing changes until the new admin accepts,
    /// so a typo in the address can't lock everyone out.
    function proposeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    /// Step 2: the proposed address proves it controls its key by calling this.
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not proposed admin");
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// Emergency stop: freezes batch creation and handovers (e.g. a compromised wallet).
    /// Recalls keep working while paused, because safety actions must never be blocked.
    function pause() external onlyAdmin {
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAdmin {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ───────────────────────── Batches ─────────────────────────
    function createBatch(
        string calldata batchId,
        string calldata drugName,
        uint256 mfgDate,
        uint256 expiryDate,
        uint256 quantity,
        bytes32 docHash
    ) external whenNotPaused onlyRole(Role.Manufacturer) {
        bytes32 k = _key(batchId);
        require(!batches[k].exists, "Batch ID already used");
        require(bytes(batchId).length > 0 && bytes(batchId).length <= 64, "Batch ID 1-64 chars");
        require(bytes(drugName).length > 0 && bytes(drugName).length <= 100, "Drug name 1-100 chars");
        require(expiryDate > mfgDate, "Expiry before mfg");
        require(expiryDate > block.timestamp, "Already expired");
        require(quantity > 0, "Quantity 0");

        batches[k] = Batch({
            batchId: batchId,
            drugName: drugName,
            manufacturer: msg.sender,
            mfgDate: mfgDate,
            expiryDate: expiryDate,
            quantity: quantity,
            docHash: docHash,
            currentOwner: msg.sender,
            pendingReceiver: address(0),
            status: Status.Created,
            createdAt: block.timestamp,
            exists: true,
            receiverAccepted: false
        });
        allBatchKeys.push(k);

        history[k].push(Handover(address(0), msg.sender, block.timestamp, participants[msg.sender].location, address(0)));
        emit BatchCreated(batchId, drugName, msg.sender);
    }

    /// Step 1 of 3: current owner proposes a receiver.
    function initiateTransfer(string calldata batchId, address to) external whenNotPaused batchExists(batchId) {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];

        require(b.status != Status.Recalled, "Batch recalled");
        require(b.currentOwner == msg.sender, "Not current owner");
        require(participants[msg.sender].active, "Sender inactive");
        require(b.pendingReceiver == address(0), "Transfer already pending");
        require(participants[to].active, "Receiver not registered");
        require(_validHop(participants[msg.sender].role, participants[to].role), "Invalid supply-chain hop");

        b.pendingReceiver = to;
        b.status = Status.InTransit;
        emit TransferInitiated(batchId, msg.sender, to);
    }

    /// Step 2 of 3: receiver confirms they physically got the batch. Custody does not move yet.
    function acceptTransfer(string calldata batchId) external whenNotPaused batchExists(batchId) {
        Batch storage b = batches[_key(batchId)];

        require(b.status != Status.Recalled, "Batch recalled");
        require(b.pendingReceiver == msg.sender, "Not the pending receiver");
        require(participants[msg.sender].active, "Receiver inactive");
        require(!b.receiverAccepted, "Already accepted");

        b.receiverAccepted = true;
        b.status = Status.AwaitingApproval;
        emit TransferAccepted(batchId, b.currentOwner, msg.sender);
    }

    /// Step 3 of 3: regulator countersigns the handover. Only now does custody move.
    function approveTransfer(string calldata batchId)
        external
        whenNotPaused
        onlyRole(Role.Regulator)
        batchExists(batchId)
    {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];

        require(b.status != Status.Recalled, "Batch recalled");
        require(b.pendingReceiver != address(0), "Nothing pending");
        require(b.receiverAccepted, "Receiver has not accepted");
        // Either party may have been deactivated since steps 1-2.
        require(participants[b.pendingReceiver].active, "Receiver inactive");
        require(participants[b.currentOwner].active, "Sender inactive");

        address from = b.currentOwner;
        address to = b.pendingReceiver;
        b.currentOwner = to;
        b.pendingReceiver = address(0);
        b.receiverAccepted = false;
        b.status = _restingStatus(to);

        history[k].push(Handover(from, to, block.timestamp, participants[to].location, msg.sender));
        emit TransferApproved(batchId, from, to, msg.sender);
    }

    /// Regulator can refuse a pending handover (e.g. paperwork mismatch); the batch stays with the sender.
    function rejectTransfer(string calldata batchId, string calldata reason)
        external
        onlyRole(Role.Regulator)
        batchExists(batchId)
    {
        Batch storage b = batches[_key(batchId)];
        require(b.pendingReceiver != address(0), "Nothing pending");
        require(bytes(reason).length > 0, "Reason required");

        _clearPending(b);
        emit TransferRejected(batchId, msg.sender, reason);
    }

    /// Sender can cancel a pending transfer (e.g. wrong receiver chosen) until the regulator approves it.
    function cancelTransfer(string calldata batchId) external batchExists(batchId) {
        Batch storage b = batches[_key(batchId)];
        require(b.currentOwner == msg.sender, "Not current owner");
        require(b.pendingReceiver != address(0), "Nothing pending");

        _clearPending(b);
        emit TransferCancelled(batchId, msg.sender);
    }

    /// Regulator, or the manufacturer of this batch, can recall it.
    function recallBatch(string calldata batchId, string calldata reason) external batchExists(batchId) {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];
        bool isRegulator = participants[msg.sender].active && participants[msg.sender].role == Role.Regulator;
        require(isRegulator || b.manufacturer == msg.sender, "Not allowed to recall");
        require(b.status != Status.Recalled, "Already recalled");

        b.status = Status.Recalled;
        b.pendingReceiver = address(0);
        b.receiverAccepted = false;
        recallReason[k] = reason;
        emit BatchRecalled(batchId, reason, msg.sender);
    }

    // ───────────────────────── Views (free, used by frontend) ─────────────────────────
    function getBatch(string calldata batchId) external view batchExists(batchId) returns (Batch memory) {
        return batches[_key(batchId)];
    }

    function getHistory(string calldata batchId) external view batchExists(batchId) returns (Handover[] memory) {
        return history[_key(batchId)];
    }

    /// One-call summary for the public QR verify page.
    function verifyBatch(string calldata batchId)
        external
        view
        returns (bool exists, bool recalled, bool expired, string memory drugName, string memory manufacturerName, string memory currentHolder, uint256 hops)
    {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];
        if (!b.exists) return (false, false, false, "", "", "", 0);
        return (
            true,
            b.status == Status.Recalled,
            block.timestamp > b.expiryDate,
            b.drugName,
            participants[b.manufacturer].name,
            participants[b.currentOwner].name,
            history[k].length
        );
    }

    function totalBatches() external view returns (uint256) {
        return allBatchKeys.length;
    }

    /// Batch ID by creation order (0 = first), so apps can list every batch without scanning events.
    function batchIdAt(uint256 index) external view returns (string memory) {
        require(index < allBatchKeys.length, "Index out of range");
        return batches[allBatchKeys[index]].batchId;
    }

    // ───────────────────────── Internal ─────────────────────────
    function _key(string memory batchId) internal pure returns (bytes32) {
        return keccak256(bytes(batchId));
    }

    /// Allowed flows: Manufacturer → Distributor, Distributor → Distributor, Distributor → Pharmacy
    function _validHop(Role from, Role to) internal pure returns (bool) {
        if (from == Role.Manufacturer && to == Role.Distributor) return true;
        if (from == Role.Distributor && (to == Role.Distributor || to == Role.Pharmacy)) return true;
        return false;
    }

    /// Status of a batch sitting (not moving) with `holder`.
    function _restingStatus(address holder) internal view returns (Status) {
        Role r = participants[holder].role;
        if (r == Role.Manufacturer) return Status.Created;
        if (r == Role.Pharmacy) return Status.AtPharmacy;
        return Status.AtDistributor;
    }

    function _clearPending(Batch storage b) internal {
        b.pendingReceiver = address(0);
        b.receiverAccepted = false;
        b.status = _restingStatus(b.currentOwner);
    }
}
