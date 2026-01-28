# iPred - Missing Components

This document outlines what has been implemented and what remains to complete the iPred protocol as specified in [docs/SPEC.md](docs/SPEC.md).

---

## Completed Components

### Smart Contracts (Arbitrum)

| Contract | Status | Description |
|----------|--------|-------------|
| `MarketFactory.sol` | Done | Create/resolve prediction markets with 2-10 categorical outcomes |
| `OrderQueue.sol` | Done | Submit/cancel encrypted orders, emits events for TEE |
| `StateAnchor.sol` | Done | Commit PMT roots on-chain, verify proofs |
| `PrivateToken.sol` | Done | Deposit/withdraw collateral, encrypted balance updates |
| `MerklePatriciaProof.sol` | Done (MVP) | Simplified proof verification library |

### Infrastructure

| Component | Status | Description |
|-----------|--------|-------------|
| Foundry project setup | Done | Build, test, deploy configuration |
| Contract tests | Done | 82 tests passing |
| Deployment scripts | Done | Deploy to Arbitrum Sepolia |

---

## Missing Components

### 1. TEE Matching Engine (Critical)

**Priority: HIGH**

The core matching engine that runs inside iExec TEE is not implemented. This is the heart of the protocol.

**What's needed:**

```
tee/
  src/
    index.ts              # Main entry point for iExec TEE app
    matching/
      orderBook.ts        # PMT-based order book implementation
      matcher.ts          # Price-time priority matching algorithm
      positionManager.ts  # Track user positions and P&L
    state/
      pmtState.ts         # @ethereumjs/trie integration
      stateManager.ts     # Encrypt/decrypt state, IPFS snapshots
    crypto/
      encryption.ts       # NaCl encryption for orders/positions
      keyManager.ts       # TEE key derivation and management
    oracle/
      oracleClient.ts     # Fetch resolution results
    blockchain/
      eventListener.ts    # Listen to OrderQueue events
      contractCaller.ts   # Call StateAnchor.commitRoot()
```

**Key Implementation Tasks:**

1. **Order Book Implementation**
   - Use `@ethereumjs/trie` for PMT storage
   - Implement composite key encoding (see SPEC.md "PMT-Native Architecture")
   - Price-time priority matching via lexicographic iteration

2. **State Management**
   - Encrypt state with TEE-derived keys
   - Commit roots after every match
   - Snapshot to IPFS periodically

3. **Event Processing**
   - Listen for `OrderSubmitted` events
   - Decrypt order payload with TEE private key
   - Process cancellations

4. **Blockchain Interaction**
   - Call `StateAnchor.commitRoot()` after matches
   - Call `PrivateToken.batchUpdateBalances()` for settlements

**Dependencies:**
```json
{
  "@iexec/iexec-sdk": "^8.x",
  "@ethereumjs/trie": "^6.x",
  "tweetnacl": "^1.x",
  "viem": "^2.x"
}
```

---

### 2. iExec Integration (Critical)

**Priority: HIGH**

No iExec-specific configuration or TEE application setup exists.

**What's needed:**

1. **iExec Account Setup**
   - Create iExec account at https://market.iex.ec
   - Fund with RLC for TEE execution

2. **TEE Application Deployment**
   ```bash
   # Initialize iExec project
   iexec init --skip-wallet

   # Build TEE application Docker image
   docker build -t ipred-tee .

   # Push to iExec registry
   iexec app deploy
   ```

3. **Configuration Files**
   ```
   iexec/
     iexec.json           # iExec app configuration
     chain.json           # Network configuration
     deployed.json        # Deployed app addresses
     Dockerfile           # TEE application container
   ```

4. **TEE Attestation**
   - Implement proper Intel SGX attestation verification in `StateAnchor._verifyAttestation()`
   - Currently simplified for MVP

---

### 3. Oracle Integration

**Priority: MEDIUM**

Market resolution requires oracle data.

**What's needed:**

1. **iExec Oracle Setup**
   - Configure iExec native oracle for sports/esports data
   - Define data sources (ESPN API, etc.)

2. **Oracle Contract/Service**
   ```solidity
   // Example oracle callback
   function fulfillResolution(
       bytes32 marketId,
       uint8 winningOutcome,
       bytes calldata proof
   ) external onlyOracle;
   ```

3. **Resolution Workflow**
   - TEE receives oracle result
   - Verifies attestation
   - Calls `MarketFactory.resolveMarket()`
   - Triggers settlement in `PrivateToken`

---

### 4. Frontend / CLI

**Priority: MEDIUM**

No user interface exists.

**What's needed:**

1. **CLI (Minimum)**
   ```
   cli/
     src/
       commands/
         deposit.ts        # Deposit USDC
         withdraw.ts       # Request withdrawal
         order.ts          # Place encrypted order
         cancel.ts         # Cancel order
         markets.ts        # List markets
         positions.ts      # View positions (decrypted locally)
         proof.ts          # Verify order/position proof
   ```

2. **Frontend (Full)**
   ```
   frontend/
     src/
       components/
         MarketList.tsx
         OrderForm.tsx
         PositionView.tsx
         DepositWithdraw.tsx
       hooks/
         useMarkets.ts
         useOrders.ts
         useEncryption.ts
       lib/
         encryption.ts     # Client-side encryption
         proofVerifier.ts  # Verify MPT proofs
   ```

**User Flow:**
1. User generates ephemeral keypair
2. Fetches TEE public key
3. Encrypts order with TEE pubkey
4. Submits to `OrderQueue` contract
5. Receives encrypted result from TEE
6. Decrypts with private key

---

### 5. Full MPT Proof Verification

**Priority: LOW (for MVP)**

The `MerklePatriciaProof` library is simplified.

**What's needed:**

1. **Full RLP Decoding**
   - Parse proof nodes properly
   - Handle branch, extension, leaf nodes

2. **Path Verification**
   - Verify nibble path from root to leaf
   - Handle hex prefix encoding

3. **On-Chain Verification**
   - Port `@ethereumjs/trie` proof verification to Solidity
   - Or use existing libraries like `merkle-patricia-proof`

---

### 6. Additional Features (Post-MVP)

| Feature | Description |
|---------|-------------|
| Multi-market support | Handle multiple concurrent markets |
| Market orders | Execute at best available price |
| AMM liquidity | Automated market maker for low liquidity |
| Governance | Token-based protocol governance |
| Cross-chain deposits | LayerZero integration |
| Historical proofs | Query proofs at past state versions |
| Dispute resolution | UMA-style optimistic oracle |

---

## Deployment Checklist

### Before Testnet Deployment

- [ ] Set up iExec account and fund with RLC
- [ ] Build and deploy TEE application to iExec
- [ ] Get TEE wallet address from iExec deployment
- [ ] Update `.env` with `TEE_ADDRESS`
- [ ] Configure oracle data source
- [ ] Update `.env` with `ORACLE_ADDRESS`

### Deploy Contracts

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Deploy to Arbitrum Sepolia
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify

# Or deploy mock USDC first (if needed)
forge script script/Deploy.s.sol:DeployMockUSDC --rpc-url arbitrum_sepolia --broadcast
```

### After Deployment

- [ ] Whitelist market creators in `MarketFactory`
- [ ] Configure TEE with deployed contract addresses
- [ ] Create first test market
- [ ] Test full order flow

---

## Quick Start for Development

```bash
# Build contracts
forge build

# Run tests
forge test

# Run tests with verbosity
forge test -vvv

# Gas report
forge test --gas-report

# Deploy locally
anvil &
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

---

## Architecture Summary

```
User                    Arbitrum L2                    iExec TEE
  |                         |                              |
  |-- 1. Encrypt order ---->|                              |
  |                         |                              |
  |-- 2. submitOrder() ---->|-- OrderSubmitted event ----->|
  |                         |                              |
  |                         |        3. Decrypt & match    |
  |                         |        4. Update PMT state   |
  |                         |                              |
  |                         |<-- 5. commitRoot() ----------|
  |                         |                              |
  |<-- 6. Encrypted result -|------------------------------|
  |                         |                              |
  |    7. Decrypt locally   |                              |
```

---

## Resources

- [iExec Documentation](https://docs.iex.ec/)
- [iExec SDK](https://github.com/iExecBlockchainComputing/iexec-sdk)
- [Foundry Book](https://book.getfoundry.sh/)
- [@ethereumjs/trie](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/trie)
- [TweetNaCl.js](https://tweetnacl.js.org/)
