# MediChain architecture

## Layers

```mermaid
flowchart LR
    SC["Smart contract<br/>(Solidity on Polygon Amoy)"]
    LIB["frontend/src/lib/contract.js<br/>ABI + ethers v6"]
    DASH["Dashboards<br/>(Manufacturer, Distributor,<br/>Pharmacy, Regulator)"]
    VER["Verify page<br/>/verify/:batchId"]
    MM["MetaMask<br/>(signs transactions)"]
    RPC["Public RPC<br/>(read-only)"]

    SC --- LIB
    LIB --> DASH
    LIB --> VER
    DASH -- write --> MM --> SC
    VER -- read --> RPC --> SC
```

- **Writes** (create, transfer, accept, recall) come from the dashboards and are signed in MetaMask by a registered participant. The contract checks the caller's role.
- **Reads** for customers go through a public RPC. `verifyBatch`, `getBatch`, `getHistory` and `participants` are `view` calls: they cost no gas and need no wallet.
- Only a hash of the lab report (`docHash`) is stored on-chain. The file itself lives off-chain (IPFS).

## Custody flow

Every handover takes two steps. The current owner **initiates** a transfer to a named receiver, and the batch becomes `InTransit`. Ownership moves only when that receiver **accepts**. This stops someone from dumping a batch on another participant, and the history records who actually received it.

```mermaid
sequenceDiagram
    actor M as Manufacturer
    actor D as Distributor
    actor P as Pharmacy
    actor R as Regulator
    participant C as MediChain contract
    actor U as Customer

    M->>C: createBatch(id, drug, dates, qty, docHash)
    Note over C: status = Created, owner = Manufacturer

    M->>C: initiateTransfer(id, Distributor)
    Note over C: status = InTransit, pendingReceiver = Distributor
    D->>C: acceptTransfer(id)
    Note over C: status = AtDistributor, history += (M → D)

    D->>C: initiateTransfer(id, Pharmacy)
    Note over C: status = InTransit, pendingReceiver = Pharmacy
    P->>C: acceptTransfer(id)
    Note over C: status = AtPharmacy, history += (D → P)

    opt Safety issue found
        R->>C: recallBatch(id, reason)
        Note over C: status = Recalled (from any state)
    end

    U->>C: verifyBatch(id) (free read via QR scan)
    C-->>U: exists, recalled, expired, drug, manufacturer, holder, hops
```

> Function names for writes are illustrative. The exact names are in Member A's contract under `contracts/`.

## Batch status

```mermaid
stateDiagram-v2
    [*] --> Created: manufacturer registers batch
    Created --> InTransit: initiate transfer
    InTransit --> AtDistributor: distributor accepts
    AtDistributor --> InTransit: initiate transfer
    InTransit --> AtPharmacy: pharmacy accepts
    Created --> Recalled: regulator
    InTransit --> Recalled: regulator
    AtDistributor --> Recalled: regulator
    AtPharmacy --> Recalled: regulator
```

## How the verify page decides its verdict

| `verifyBatch` result | Verdict shown |
|---|---|
| `exists == false` | **NOT FOUND**: possibly counterfeit |
| `recalled == true` | **RECALLED**, with the reason from `recallReason(keccak256(batchId))` |
| `expired == true` | **EXPIRED** |
| otherwise | **GENUINE** |

The timeline comes from `getHistory(batchId)`. Its first entry has `from = 0x0`, which means "created by the manufacturer". Each address is turned into a readable name and location with `participants(address)`.
