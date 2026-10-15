// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MedChain — medicine batch tracking from manufacturer → distributor → pharmacy.
 *
 * Key ideas:
 *  - Only registered participants (with a role) can act.
 *  - Custody changes need BOTH sides: sender initiates, receiver accepts.
 *  - Every handover is stored, so anyone can see the full chain of custody.
 *  - Regulator (or the batch's manufacturer) can recall a batch.
 *  - verifyBatch() is a free read call used by the public QR-scan page.
 */
contract MedChain {
    // ───────────────────────── Types ─────────────────────────
    enum Role { None, Manufacturer, Distributor, Pharmacy, Regulator }
    enum Status { Created, InTransit, AtDistributor, AtPharmacy, Recalled }

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
    }

    struct Handover {
        address from;
        address to;
        uint256 timestamp;
        string location;
    }

    // ───────────────────────── Storage ─────────────────────────
    address public admin;
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
    event TransferCancelled(string batchId, address indexed by);
    event BatchRecalled(string batchId, string reason, address indexed by);

    // ───────────────────────── Modifiers ─────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
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
        participants[account] = Participant(role, name, location, true);
        emit ParticipantRegistered(account, role, name);
    }

    function deactivateParticipant(address account) external onlyAdmin {
        participants[account].active = false;
        emit ParticipantDeactivated(account);
    }

    // ───────────────────────── Batches ─────────────────────────
    function createBatch(
        string calldata batchId,
        string calldata drugName,
        uint256 mfgDate,
        uint256 expiryDate,
        uint256 quantity,
        bytes32 docHash
    ) external onlyRole(Role.Manufacturer) {
        bytes32 k = _key(batchId);
        require(!batches[k].exists, "Batch ID already used");
        require(expiryDate > mfgDate, "Expiry before mfg");
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
            exists: true
        });
        allBatchKeys.push(k);

        history[k].push(Handover(address(0), msg.sender, block.timestamp, participants[msg.sender].location));
        emit BatchCreated(batchId, drugName, msg.sender);
    }

    /// Step 1 of handover: current owner proposes a receiver.
    function initiateTransfer(string calldata batchId, address to) external batchExists(batchId) {
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

    /// Step 2 of handover: receiver confirms they physically got the batch.
    function acceptTransfer(string calldata batchId) external batchExists(batchId) {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];

        require(b.status != Status.Recalled, "Batch recalled");
        require(b.pendingReceiver == msg.sender, "Not the pending receiver");

        address from = b.currentOwner;
        b.currentOwner = msg.sender;
        b.pendingReceiver = address(0);
        b.status = participants[msg.sender].role == Role.Pharmacy ? Status.AtPharmacy : Status.AtDistributor;

        history[k].push(Handover(from, msg.sender, block.timestamp, participants[msg.sender].location));
        emit TransferAccepted(batchId, from, msg.sender);
    }

    /// Sender can cancel a pending transfer (e.g. wrong receiver chosen).
    function cancelTransfer(string calldata batchId) external batchExists(batchId) {
        bytes32 k = _key(batchId);
        Batch storage b = batches[k];
        require(b.currentOwner == msg.sender, "Not current owner");
        require(b.pendingReceiver != address(0), "Nothing pending");

        b.pendingReceiver = address(0);
        b.status = participants[msg.sender].role == Role.Manufacturer ? Status.Created : Status.AtDistributor;
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
}
