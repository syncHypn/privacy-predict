# iPred: Private Prediction Market Specification

> Trade prediction markets with the transparency of DeFi and the privacy of CeFi

## Executive Summary

iPred is a privacy-preserving prediction market protocol leveraging iExec TEE (Trusted Execution Environment) for confidential order matching and encrypted token balances. Users can bet on categorical outcomes (sports, esports, events) without revealing their positions, bet sizes, or trading strategies.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Privacy Model](#privacy-model)
5. [Market Mechanics](#market-mechanics)
6. [Order Book Design](#order-book-design)
7. [Resolution & Settlement](#resolution--settlement)
8. [Security Model](#security-model)
9. [Technical Stack](#technical-stack)
10. [Implementation Roadmap](#implementation-roadmap)
11. [API Specification](#api-specification)

---

## Overview

### Problem Statement

Current prediction markets (Polymarket, Augur) expose:
- **Order flow**: Front-runners can see and exploit pending bets
- **Position sizes**: Competitors can see your exposure and trade against you
- **Market sentiment**: Visible order books reveal information before resolution
- **Whale activity**: Large bets move markets before execution

### Solution

iPred processes all bets inside a TEE where:
- Orders are encrypted until matched
- Positions remain private to each user
- Only aggregate market data (spread, last price) is visible
- Settlement happens privately with encrypted token transfers

### Key Features

| Feature | Description |
|---------|-------------|
| Private Betting | Bet amounts and positions hidden from all parties |
| Categorical Markets | Support up to 10 outcomes per market |
| Order Book Trading | Limit orders matched in TEE for best execution |
| Private Settlement | Winners receive funds without revealing positions |
| MEV Resistant | Encrypted order flow prevents front-running |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface                               │
│                    (React Frontend / CLI)                            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Encrypted Orders
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Arbitrum L2 Contracts                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  MarketFactory  │  │  PrivateToken   │  │    OrderQueue       │  │
│  │                 │  │   (Nocturne)    │  │                     │  │
│  │  - Create       │  │                 │  │  - Submit orders    │  │
│  │  - Resolve      │  │  - Encrypted    │  │  - Emit events      │  │
│  │  - Whitelist    │  │    balances     │  │  - Batch commits    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Events / Callbacks
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    iExec TEE (Single Enclave)                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Matching Engine                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │ Order Books  │  │   Position   │  │   Settlement     │   │    │
│  │  │ (per outcome)│  │   Manager    │  │   Calculator     │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │   MPT State  │  │  Encryption  │  │  Oracle Client   │   │    │
│  │  │   Manager    │  │   Service    │  │                  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Encrypted State
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      State Storage (IPFS)                            │
│                   Encrypted MPT root + deltas                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User encrypts order with TEE public key
2. User submits encrypted order to OrderQueue contract
3. Contract emits event, iExec picks up order
4. TEE decrypts, validates, matches order
5. TEE updates encrypted state (positions, balances)
6. TEE calls back to contracts with:
   - New encrypted balances (PrivateToken)
   - Execution confirmations
   - Updated market state (best bid/ask only)
7. User decrypts their position update with their key
```

---

## Core Components

### 1. Smart Contracts (Arbitrum)

#### MarketFactory.sol
```solidity
struct Market {
    bytes32 marketId;
    string question;           // "Who will win the match?"
    string[] outcomes;         // ["Team A", "Team B", "Draw"]
    uint256 resolutionTime;    // When market resolves
    uint8 winningOutcome;      // Set after resolution (255 = unresolved)
    bool resolved;
    address creator;
}

// Core functions
function createMarket(string question, string[] outcomes, uint256 resolutionTime) external onlyWhitelisted;
function resolveMarket(bytes32 marketId, uint8 winningOutcome) external onlyOracle;
function getMarketInfo(bytes32 marketId) external view returns (Market);
```

#### OrderQueue.sol
```solidity
struct EncryptedOrder {
    bytes32 orderId;
    bytes32 marketId;
    address user;
    bytes encryptedPayload;    // Encrypted: {side, outcome, price, amount}
    uint256 timestamp;
}

// Core functions
function submitOrder(bytes32 marketId, bytes encryptedPayload) external;
function cancelOrder(bytes32 orderId, bytes signature) external;

// Events for TEE
event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address user, bytes payload);
event OrderCancelled(bytes32 indexed orderId);
```

#### PrivateToken.sol (Nocturne Integration)
```solidity
// Encrypted balance mapping
mapping(address => bytes) public encryptedBalances;

// TEE-only functions
function batchUpdateBalances(address[] users, bytes[] newBalances) external onlyTEE;
function mint(address to, bytes encryptedAmount) external onlyOwner;

// User functions
function deposit(uint256 amount) external;      // Convert USDC to private tokens
function withdraw(bytes proof) external;        // Withdraw with ZK proof of balance
```

#### StateAnchor.sol (PMT Root Commitment)
```solidity
contract StateAnchor {
    bytes32 public currentRoot;
    uint256 public stateVersion;
    address public teeAddress;

    mapping(uint256 => bytes32) public rootHistory;  // version => root
    mapping(bytes32 => uint256) public rootVersions; // root => version (for proof verification)

    event StateUpdated(
        uint256 indexed version,
        bytes32 indexed newRoot,
        bytes32 indexed previousRoot,
        bytes32 matchId
    );

    modifier onlyTEE() {
        require(msg.sender == teeAddress, "Only TEE");
        _;
    }

    // Called after EVERY match
    function commitRoot(
        bytes32 newRoot,
        bytes32 matchId,
        bytes calldata teeAttestation
    ) external onlyTEE {
        require(verifyAttestation(teeAttestation), "Invalid attestation");

        bytes32 previousRoot = currentRoot;
        currentRoot = newRoot;
        stateVersion++;

        rootHistory[stateVersion] = newRoot;
        rootVersions[newRoot] = stateVersion;

        emit StateUpdated(stateVersion, newRoot, previousRoot, matchId);
    }

    // Verify a Merkle Patricia proof against a committed root
    function verifyProof(
        bytes32 root,
        bytes memory key,
        bytes memory value,
        bytes[] memory proof
    ) external view returns (bool) {
        require(rootVersions[root] > 0, "Root not committed");
        return MerklePatriciaProof.verify(root, key, value, proof);
    }

    // Get root at specific version (for historical proofs)
    function getRootAtVersion(uint256 version) external view returns (bytes32) {
        require(version <= stateVersion, "Version not yet committed");
        return rootHistory[version];
    }

    function verifyAttestation(bytes calldata attestation) internal pure returns (bool) {
        // Verify Intel SGX attestation
        // Implementation depends on iExec's attestation format
        return true; // Simplified for spec
    }
}
```

### 2. TEE Matching Engine

#### Order Book (per outcome)
```typescript
interface OrderBook {
  marketId: string;
  outcomeIndex: number;
  bids: PriorityQueue<Order>;  // Sorted by price DESC, time ASC
  asks: PriorityQueue<Order>;  // Sorted by price ASC, time ASC
}

interface Order {
  orderId: string;
  userId: string;
  side: 'BUY' | 'SELL';
  price: number;      // 0.01 to 0.99 (probability)
  amount: number;     // In collateral units
  timestamp: number;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
}
```

#### Position Manager
```typescript
interface Position {
  oderId: string
  oderId: string
  oderId: string
  userId: string;
  marketId: string;
  outcomeIndex: number;
  shares: number;           // Positive = long, negative = short
  avgEntryPrice: number;
  realizedPnL: number;
}

interface UserState {
  balance: bigint;          // Available collateral
  positions: Map<string, Position>;  // marketId:outcomeIndex -> Position
}
```

#### State Management (MPT)
```typescript
interface StateRoot {
  version: number;
  rootHash: string;
  timestamp: number;
}

// State stored as encrypted Merkle Patricia Trie
// Keys: user addresses
// Values: encrypted UserState
```

### 3. Oracle Integration (iExec Native)

```typescript
interface OracleRequest {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: number;
}

interface OracleResponse {
  marketId: string;
  winningOutcome: number;    // Index of winning outcome
  attestation: string;       // TEE attestation of result
}
```

---

## Privacy Model

### What is Private

| Data | Visibility | Rationale |
|------|------------|-----------|
| Order contents | TEE only | Prevent front-running |
| Position sizes | User only | Prevent position hunting |
| User balances | User only | Financial privacy |
| Order book depth | Hidden | Prevent manipulation |
| Individual trades | Participants only | Trade privacy |

### What is Public

| Data | Visibility | Rationale |
|------|------------|-----------|
| Market exists | Public | Discoverability |
| Market question/outcomes | Public | Users need to know what they're betting on |
| Best bid/ask (spread) | Public | Price discovery, UX |
| Last trade price | Public | Market sentiment signal |
| Total volume (optional) | Public | Market health indicator |
| Resolution result | Public | Verifiable fairness |

### Encryption Scheme

```
User -> TEE Communication:
- NaCl box (X25519 + XSalsa20-Poly1305)
- User encrypts with TEE public key
- TEE decrypts inside enclave

TEE -> User Communication:
- Each user has ephemeral keypair
- TEE encrypts response with user's public key
- User decrypts locally

State Encryption:
- AES-256-GCM for state at rest
- TEE-derived key from sealing
- Key never leaves enclave
```

---

## Market Mechanics

### Categorical Market Structure

For a market "Who wins: Team A vs Team B vs Draw?":

```
Market ID: 0xabc123...
Outcomes: [0: "Team A", 1: "Team B", 2: "Draw"]

Order Books:
- Outcome 0 Book: Buy/Sell shares of "Team A wins"
- Outcome 1 Book: Buy/Sell shares of "Team B wins"
- Outcome 2 Book: Buy/Sell shares of "Draw"

Price Constraint: Sum of fair prices should approach 1.0
- If Team A = 0.45, Team B = 0.40, Draw = 0.15 → Sum = 1.0
```

### Order Types (MVP)

| Type | Description |
|------|-------------|
| Limit Buy | Buy shares at specified price or better |
| Limit Sell | Sell shares at specified price or better |
| Cancel | Cancel open order by ID |

### Position Lifecycle

```
1. OPEN POSITION
   - User buys 100 shares of "Team A" at 0.45
   - Cost: 100 * 0.45 = 45 USDC
   - Position: +100 shares @ 0.45 avg

2. INCREASE POSITION
   - User buys 50 more at 0.50
   - Cost: 50 * 0.50 = 25 USDC
   - Position: +150 shares @ 0.467 avg

3. REDUCE POSITION
   - User sells 50 shares at 0.55
   - Revenue: 50 * 0.55 = 27.5 USDC
   - Realized P&L: 50 * (0.55 - 0.467) = +4.15 USDC
   - Position: +100 shares @ 0.467 avg

4. SETTLEMENT (Team A wins)
   - Each share pays 1.0
   - Payout: 100 * 1.0 = 100 USDC
   - Total P&L: 100 - (100 * 0.467) + 4.15 = +57.45 USDC

4b. SETTLEMENT (Team A loses)
   - Each share pays 0.0
   - Payout: 0 USDC
   - Total P&L: 0 - (100 * 0.467) + 4.15 = -42.55 USDC
```

### Fee Structure

| Fee | Amount | Recipient |
|-----|--------|-----------|
| Trading fee | 0.5% of notional | Protocol treasury |
| Settlement fee | 0.1% of payout | Protocol treasury |
| Market creation | 10 USDC bond | Returned if resolved properly |

---

## Order Book Design

### PMT-Native Architecture

The order book is implemented as a **Patricia Merkle Trie (PMT)** where all state lives in the trie structure. This provides:

1. **Verifiable State**: Users can verify their orders exist via Merkle proofs
2. **On-Chain Anchoring**: Root hash committed after every match for dispute resolution
3. **Deterministic Matching**: Same inputs always produce same state transitions
4. **Auditability**: Complete state history via root chain on-chain

```
┌─────────────────────────────────────────────────────────────────┐
│                     PMT Order Book State                         │
│                                                                  │
│  Root Hash ─────────────────────────────────────────────────────│
│       │                                                          │
│       ├── market:{marketId}:outcome:{idx}:ask:{price}:{orderId} │
│       │         → Order data                                     │
│       │                                                          │
│       ├── market:{marketId}:outcome:{idx}:bid:{invPrice}:{orderId}
│       │         → Order data (inverted price for sort)           │
│       │                                                          │
│       ├── user:{address}:balance                                 │
│       │         → Encrypted balance                              │
│       │                                                          │
│       └── user:{address}:position:{marketId}:{outcomeIdx}        │
│                 → Position data                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Composite Key Encoding

Keys are structured for efficient iteration during matching:

```typescript
// Key format: {namespace}:{...segments}
type PMTKey = string;

// Order keys - designed for lexicographic iteration
interface OrderKeyComponents {
  marketId: string;      // 32 bytes hex
  outcomeIndex: number;  // 0-9
  side: 'bid' | 'ask';
  price: string;         // 4 chars, see encoding below
  orderId: string;       // 32 bytes hex (timestamp-based for FIFO)
}

function encodeOrderKey(c: OrderKeyComponents): PMTKey {
  const priceEncoded = c.side === 'ask'
    ? encodePriceAsk(c.price)      // 0.45 → "0450" (natural sort)
    : encodePriceBid(c.price);     // 0.45 → "9549" (inverted for DESC)

  return `market:${c.marketId}:outcome:${c.outcomeIndex}:${c.side}:${priceEncoded}:${c.orderId}`;
}

// Price encoding for lexicographic ordering
function encodePriceAsk(price: number): string {
  // 0.01 → "0001", 0.99 → "0099"
  // Natural ascending order: lower prices first (better asks)
  return Math.round(price * 100).toString().padStart(4, '0');
}

function encodePriceBid(price: number): string {
  // Invert so higher prices sort first
  // 0.99 → "0000", 0.01 → "0098"
  // Lexicographic ascending = price descending (better bids)
  const inverted = 9999 - Math.round(price * 100);
  return inverted.toString().padStart(4, '0');
}

// Examples:
// Ask 0.45 → "market:0xabc:outcome:0:ask:0045:0x123"
// Bid 0.45 → "market:0xabc:outcome:0:bid:9954:0x456"
// Bid 0.50 → "market:0xabc:outcome:0:bid:9949:0x789" (sorts BEFORE 0.45 bid)
```

### Order Data Structure

```typescript
interface OrderValue {
  orderId: string;
  userId: string;
  side: 'BUY' | 'SELL';
  price: number;           // Original price (0.01-0.99)
  amount: number;          // Remaining amount
  originalAmount: number;  // Initial amount (for partial fill tracking)
  timestamp: number;       // Unix ms, used in orderId for FIFO
  status: 'OPEN' | 'PARTIAL';
}

// Serialized as JSON, stored as value in PMT
```

### PMT-Native Matching Algorithm

```typescript
import { Trie } from '@ethereumjs/trie';

class PMTOrderBook {
  private trie: Trie;

  async match(incomingOrder: Order): Promise<MatchResult> {
    const fills: Fill[] = [];
    let remaining = incomingOrder.amount;

    // Determine which side of the book to match against
    const matchSide = incomingOrder.side === 'BUY' ? 'ask' : 'bid';
    const keyPrefix = `market:${incomingOrder.marketId}:outcome:${incomingOrder.outcomeIndex}:${matchSide}:`;

    // Iterate through orders in price-time priority
    // PMT iteration is lexicographic, our key encoding ensures correct order
    for await (const { key, value } of this.trie.createReadStream({ gte: keyPrefix, lt: keyPrefix + '~' })) {
      const makerOrder: OrderValue = JSON.parse(value.toString());

      // Check price compatibility
      if (!priceMatches(incomingOrder, makerOrder)) break;

      // Calculate fill
      const fillAmount = Math.min(remaining, makerOrder.amount);
      fills.push({
        makerId: makerOrder.orderId,
        visitorId: incomingOrder.orderId,
        amount: fillAmount,
        price: makerOrder.price,
      });

      // Update or remove maker order in PMT
      if (fillAmount >= makerOrder.amount) {
        await this.trie.del(Buffer.from(key));
      } else {
        makerOrder.amount -= fillAmount;
        makerOrder.status = 'PARTIAL';
        await this.trie.put(Buffer.from(key), Buffer.from(JSON.stringify(makerOrder)));
      }

      remaining -= fillAmount;
      if (remaining === 0) break;
    }

    // Add remaining as resting order
    if (remaining > 0) {
      const restingOrder: OrderValue = {
        ...incomingOrder,
        amount: remaining,
        status: remaining < incomingOrder.amount ? 'PARTIAL' : 'OPEN',
      };
      const key = encodeOrderKey({
        marketId: incomingOrder.marketId,
        outcomeIndex: incomingOrder.outcomeIndex,
        side: incomingOrder.side === 'BUY' ? 'bid' : 'ask',
        price: incomingOrder.price,
        orderId: incomingOrder.orderId,
      });
      await this.trie.put(Buffer.from(key), Buffer.from(JSON.stringify(restingOrder)));
    }

    // Update positions and balances for all fills
    await this.updatePositionsAndBalances(fills, incomingOrder);

    return {
      fills,
      remainingAmount: remaining,
      newRoot: this.trie.root().toString('hex'),
    };
  }

  private priceMatches(taker: Order, maker: OrderValue): boolean {
    if (taker.side === 'BUY') {
      return maker.price <= taker.price; // Taker willing to pay at least maker's ask
    } else {
      return maker.price >= taker.price; // Taker willing to sell at least at maker's bid
    }
  }
}
```

### On-Chain Root Commitment

After **every match**, the new PMT root is committed on-chain:

```solidity
// StateAnchor.sol
contract StateAnchor {
    bytes32 public currentRoot;
    uint256 public stateVersion;

    // Emitted after each match - enables proof verification
    event StateUpdated(
        uint256 indexed version,
        bytes32 indexed newRoot,
        bytes32 indexed previousRoot,
        bytes32 matchId  // Links to specific match for audit
    );

    // Called by TEE after each match
    function commitRoot(
        bytes32 newRoot,
        bytes32 matchId,
        bytes calldata attestation
    ) external onlyTEE {
        require(verifyAttestation(attestation), "Invalid TEE attestation");

        emit StateUpdated(stateVersion, newRoot, currentRoot, matchId);

        currentRoot = newRoot;
        stateVersion++;
    }

    // Users can verify proofs against committed roots
    function verifyProof(
        bytes32 root,
        bytes calldata key,
        bytes calldata value,
        bytes calldata proof
    ) external pure returns (bool) {
        return MerklePatriciaProof.verify(root, key, value, proof);
    }
}
```

### Proof Generation & Verification

Users can request proofs to verify their state without trusting the TEE:

```typescript
// TEE generates proof for user's order
async function generateOrderProof(orderId: string): Promise<OrderProof> {
  const key = getOrderKeyById(orderId);
  const proof = await trie.createProof(Buffer.from(key));
  const value = await trie.get(Buffer.from(key));

  return {
    key,
    value: value?.toString() ?? null,
    proof: proof.map(p => p.toString('hex')),
    root: trie.root().toString('hex'),
    stateVersion: currentVersion,
  };
}

// Client-side verification
async function verifyOrderExists(
  proof: OrderProof,
  expectedOrder: Order,
  onChainRoot: string
): Promise<boolean> {
  // 1. Verify root matches on-chain
  if (proof.root !== onChainRoot) return false;

  // 2. Verify Merkle proof
  const isValid = await Trie.verifyProof(
    Buffer.from(proof.root, 'hex'),
    Buffer.from(proof.key),
    proof.proof.map(p => Buffer.from(p, 'hex'))
  );
  if (!isValid) return false;

  // 3. Verify order data matches
  const orderData = JSON.parse(proof.value);
  return orderData.orderId === expectedOrder.orderId
    && orderData.amount === expectedOrder.amount;
}
```

### Price-Time Priority via Key Design

The composite key structure ensures correct matching order:

```
Asks (ascending price, then time):
  market:X:outcome:0:ask:0030:ts001  → 0.30 @ time 1 (BEST - matched first)
  market:X:outcome:0:ask:0030:ts002  → 0.30 @ time 2
  market:X:outcome:0:ask:0045:ts001  → 0.45 @ time 1
  market:X:outcome:0:ask:0050:ts001  → 0.50 @ time 1 (WORST)

Bids (descending price via inversion, then time):
  market:X:outcome:0:bid:9949:ts001  → 0.50 @ time 1 (BEST - matched first)
  market:X:outcome:0:bid:9949:ts002  → 0.50 @ time 2
  market:X:outcome:0:bid:9954:ts001  → 0.45 @ time 1
  market:X:outcome:0:bid:9969:ts001  → 0.30 @ time 1 (WORST)
```

### Spread Calculation (Public)

```typescript
async function getPublicSpread(marketId: string): Promise<SpreadInfo[]> {
  const spreads: SpreadInfo[] = [];

  for (let outcomeIdx = 0; outcomeIdx < numOutcomes; outcomeIdx++) {
    // Get best bid (first in inverted-price iteration)
    const bidPrefix = `market:${marketId}:outcome:${outcomeIdx}:bid:`;
    let bestBid: number | null = null;
    for await (const { value } of trie.createReadStream({ gte: bidPrefix, lt: bidPrefix + '~', limit: 1 })) {
      bestBid = JSON.parse(value.toString()).price;
      break;
    }

    // Get best ask (first in natural-price iteration)
    const askPrefix = `market:${marketId}:outcome:${outcomeIdx}:ask:`;
    let bestAsk: number | null = null;
    for await (const { value } of trie.createReadStream({ gte: askPrefix, lt: askPrefix + '~', limit: 1 })) {
      bestAsk = JSON.parse(value.toString()).price;
      break;
    }

    spreads.push({ outcomeIndex: outcomeIdx, bestBid, bestAsk });
    // Note: Depth is NOT revealed - only best prices
  }

  return spreads;
}
```

### State Transitions & Audit Trail

Every state change produces a new root, creating an immutable audit trail:

```
State v0: Root_0 (genesis)
    │
    ▼ Order A submitted (buy 100 @ 0.45)
State v1: Root_1 → committed on-chain
    │
    ▼ Order B submitted (sell 50 @ 0.40) - matches with A
State v2: Root_2 → committed on-chain (includes match)
    │
    ▼ Order C submitted (sell 50 @ 0.50) - rests on book
State v3: Root_3 → committed on-chain
```

Each root commit includes:
- Previous root (for chain verification)
- Match ID (if match occurred)
- TEE attestation (proves computation integrity)

### Gas Cost Analysis

Committing the PMT root on-chain after every match has gas implications:

#### StateAnchor.commitRoot() Gas Breakdown

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| SSTORE (currentRoot) | ~5,000 | Warm slot update (non-zero to non-zero) |
| SSTORE (stateVersion) | ~5,000 | Increment counter |
| SSTORE (rootHistory mapping) | ~22,000 | Cold slot, new entry |
| SSTORE (rootVersions mapping) | ~22,000 | Cold slot, new entry |
| Event emission (StateUpdated) | ~1,500 | 4 indexed topics + data |
| Calldata (root + matchId + attestation) | ~2,000 | ~100 bytes @ 16 gas/byte |
| Base transaction cost | ~21,000 | Inherent tx cost |

**Total per commit: ~78,500 gas**

#### Cost Projections (Arbitrum)

| Scenario | Matches/Day | Daily Gas | Daily Cost (@ 0.1 gwei L2) |
|----------|-------------|-----------|----------------------------|
| Low activity | 100 | 7.85M | ~$0.08 |
| Medium activity | 1,000 | 78.5M | ~$0.80 |
| High activity | 10,000 | 785M | ~$8.00 |

*Note: Arbitrum L2 gas is ~100x cheaper than L1. Costs shown at 0.1 gwei gas price.*

#### Cost Optimization Strategies

**1. Proof Compression (Implemented)**
```solidity
// Store only latest root, emit history via events
// Reduces SSTORE from 4 to 2 operations
// Savings: ~44,000 gas per commit
```

**2. Optional Batching Mode (Post-MVP)**
```typescript
// Config: commitEveryNMatches = 10
// Pros: 10x gas reduction
// Cons: 10x latency for proof verification
// Use case: High-frequency markets
```

**3. Attestation Caching**
```solidity
// Cache TEE attestation, only verify periodically
// Skip attestation param on subsequent calls
// Savings: ~1,500 gas per commit
```

#### Who Pays Gas?

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| Protocol pays | Treasury funds commits | Best UX | Treasury drain risk |
| Taker pays | Included in trading fee | Self-sustaining | Higher fees |
| Hybrid | Protocol subsidizes up to N/day | Balanced | Complex accounting |

**Recommended for MVP**: Protocol pays from treasury, funded by trading fees.

#### Comparison to Alternatives

| Approach | Gas/Match | Verifiability | Latency |
|----------|-----------|---------------|---------|
| PMT root per match | ~78,500 | Instant proof | Immediate |
| Batched roots (10) | ~7,850 | 10-match delay | ~seconds |
| Optimistic (dispute) | ~0 | Challenge period | ~minutes |
| No on-chain anchor | 0 | Trust TEE only | N/A |

The per-match commit approach prioritizes verifiability over gas efficiency - appropriate for a prediction market where proof of fair execution is a key value proposition.

---

## Resolution & Settlement

### Resolution Flow

```
1. Resolution time reached
2. iExec Oracle fetches result from trusted source
3. Oracle submits result to TEE with attestation
4. TEE verifies attestation
5. TEE calculates all payouts:
   - Winners: shares * 1.0
   - Losers: shares * 0.0
6. TEE batches balance updates
7. TEE calls PrivateToken.batchUpdateBalances()
8. Market marked as resolved on-chain
```

### Settlement Calculation

```typescript
function settleMarket(marketId: string, winningOutcome: number): BalanceUpdate[] {
  const updates: BalanceUpdate[] = [];

  for (const [userId, userState] of state.entries()) {
    let payout = 0;

    for (const [posKey, position] of userState.positions) {
      if (!posKey.startsWith(marketId)) continue;

      const outcomeIdx = parseInt(posKey.split(':')[1]);

      if (outcomeIdx === winningOutcome) {
        // Winner: each share pays 1.0
        payout += position.shares * 1.0;
      }
      // Losers: shares worth 0, no payout

      // Clear position
      userState.positions.delete(posKey);
    }

    if (payout > 0) {
      userState.balance += payout;
      updates.push({ userId, newEncryptedBalance: encrypt(userState.balance) });
    }
  }

  return updates;
}
```

### Dispute Handling (Post-MVP)

For hackathon: Trust iExec oracle result
Future: UMA-style optimistic oracle with dispute period

---

## Security Model

### Trust Assumptions

| Component | Trust Level | Rationale |
|-----------|-------------|-----------|
| iExec TEE | High | Intel SGX attestation, iExec's infrastructure |
| iExec Oracle | High | Native integration, TEE-verified |
| Arbitrum | Medium | Established L2, inherits Ethereum security |
| IPFS State | Low | Encrypted, integrity via MPT roots on-chain |

### Attack Vectors & Mitigations

| Attack | Vector | Mitigation |
|--------|--------|------------|
| Front-running | See pending orders | Orders encrypted, TEE-only decryption |
| Position hunting | Identify whale positions | Positions private, only user knows |
| Order book manipulation | Spoof depth | Depth hidden, only spread visible |
| MEV extraction | Reorder transactions | Order flow invisible to validators |
| State manipulation | Alter balances | MPT root on-chain, TEE attestation |
| Replay attacks | Resubmit old orders | Nonces, timestamps, order IDs |
| TEE compromise | Extract keys | Defense in depth, attestation verification |

### Remaining Risks

| Risk | Severity | Mitigation Strategy |
|------|----------|---------------------|
| Deposit/withdrawal correlation | Medium | Fixed deposit sizes, time delays |
| Timing analysis | Low | Batch order processing |
| TEE side-channel attacks | Low | iExec's hardened runtime |
| Oracle manipulation | Medium | Multiple sources, dispute period (post-MVP) |

---

## Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Smart Contracts | Solidity 0.8.x | Standard, auditable |
| L2 Chain | Arbitrum One | Largest ecosystem, iExec support |
| TEE Runtime | iExec (Gramine) | Native integration, SDK |
| Matching Engine | TypeScript | Fast iteration, iExec SDK support |
| Order Book | PMT-native (@ethereumjs/trie) | Verifiable state, on-chain anchoring |
| State Storage | PMT in TEE memory + IPFS snapshots | Fast matching, durable backups |
| Merkle Proofs | @ethereumjs/trie | Battle-tested, Ethereum-compatible proofs |
| Encryption | TweetNaCl | Audited, lightweight |
| Oracle | iExec Native Oracle | Tight integration |
| Frontend | React + Viem | Standard Web3 stack |

### PMT Library Selection

Using `@ethereumjs/trie` for the Patricia Merkle Trie implementation:

```typescript
// Installation
npm install @ethereumjs/trie @ethereumjs/util

// Usage in TEE
import { Trie } from '@ethereumjs/trie';
import { bytesToHex, hexToBytes } from '@ethereumjs/util';

const trie = new Trie();

// Put order
await trie.put(
  Buffer.from(orderKey),
  Buffer.from(JSON.stringify(orderValue))
);

// Get root for on-chain commit
const root = bytesToHex(trie.root());

// Generate proof for user verification
const proof = await trie.createProof(Buffer.from(orderKey));

// Verify proof (can be done client-side)
const value = await Trie.verifyProof(trie.root(), Buffer.from(orderKey), proof);
```

**Why @ethereumjs/trie:**
- Ethereum-native proof format (compatible with on-chain verification)
- Well-maintained, used in production
- Supports streaming iteration (efficient for order matching)
- TypeScript native (matches TEE stack)

---

## Implementation Roadmap

### Week 1: Foundation

| Day | Task | Deliverable |
|-----|------|-------------|
| 1-2 | iExec TEE setup | Hello world in enclave, SDK familiarity |
| 2 | Fork Nocturne contracts | Private token on Arbitrum testnet |
| 3 | MarketFactory + StateAnchor | Create markets, commit PMT roots on-chain |
| 4 | OrderQueue contract | Submit encrypted orders, emit events |
| 5 | PMT order book scaffold | @ethereumjs/trie setup, key encoding |
| 6 | TEE order decryption + PMT insert | Receive events, decrypt, add to trie |
| 7 | PMT matching algorithm | Match orders, commit root after each match |

### Week 2: Completion

| Day | Task | Deliverable |
|-----|------|-------------|
| 8 | Position tracking in PMT | Track shares, P&L as PMT entries |
| 9 | Proof generation API | /proof/order, /proof/position endpoints |
| 10 | Oracle integration | iExec oracle for market resolution |
| 11 | Settlement flow | Resolve market, update balances via PMT |
| 12 | Client proof verification | SDK for verifying proofs against on-chain root |
| 13 | Simple CLI demo | Place bet, verify order proof, settlement |
| 14 | Polish & documentation | Demo script, README, video |

### MVP Scope

**Included:**
- Single categorical market (2-10 outcomes)
- Sports/esports demo market
- Limit orders (buy/sell)
- Encrypted order submission
- Private positions
- PMT-native order book with on-chain root commits
- Merkle proof generation for order/position verification
- Market resolution via oracle
- Private settlement

**Excluded (Post-Hackathon):**
- Multiple concurrent markets
- Market orders
- Partial fills UI
- Advanced order types (stop-loss, etc.)
- Historical proof queries (only current state proofs)
- Liquidity mining
- Governance
- Mobile app

---

## API Specification

### User-Facing API

#### Submit Order
```typescript
POST /order/submit
Request: {
  marketId: string;
  encryptedPayload: string;  // Encrypted OrderPayload
  signature: string;         // User signature
}

// Encrypted payload structure (decrypted in TEE):
OrderPayload: {
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  price: number;            // 0.01 - 0.99
  amount: number;           // Collateral amount
  nonce: number;
}

Response: {
  orderId: string;
  status: 'SUBMITTED';
  timestamp: number;
}
```

#### Cancel Order
```typescript
POST /order/cancel
Request: {
  orderId: string;
  signature: string;
}

Response: {
  orderId: string;
  status: 'CANCELLED' | 'NOT_FOUND' | 'ALREADY_FILLED';
}
```

#### Get User State (Encrypted)
```typescript
GET /user/state?address={address}
Response: {
  encryptedState: string;    // Decrypt with user's private key
  stateVersion: number;
  merkleProof: string[];     // Verify against on-chain root
}

// Decrypted state structure:
UserState: {
  balance: string;
  positions: Position[];
  openOrders: Order[];
}
```

#### Get Market Info (Public)
```typescript
GET /market/{marketId}
Response: {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: number;
  resolved: boolean;
  winningOutcome: number | null;
  spreads: {
    outcomeIndex: number;
    bestBid: number | null;
    bestAsk: number | null;
  }[];
  lastPrice: number[];       // Last trade price per outcome
}
```

#### Get TEE Public Key
```typescript
GET /tee/pubkey
Response: {
  publicKey: string;         // X25519 public key for order encryption
  attestation: string;       // Intel SGX attestation
}
```

#### Get Order Proof (Verification)
```typescript
GET /proof/order/{orderId}
Response: {
  exists: boolean;
  key: string;               // PMT key
  value: string | null;      // Order JSON (null if cancelled/filled)
  proof: string[];           // Merkle proof nodes
  root: string;              // State root this proof is against
  stateVersion: number;      // On-chain version for verification
}

// Client verification:
// 1. Fetch on-chain root at stateVersion
// 2. Verify proof against root
// 3. Parse value to confirm order details
```

#### Get Position Proof (Verification)
```typescript
GET /proof/position/{address}/{marketId}/{outcomeIndex}
Response: {
  exists: boolean;
  key: string;               // PMT key: user:{address}:position:{marketId}:{outcomeIdx}
  value: string | null;      // Position JSON (encrypted with user's key)
  proof: string[];           // Merkle proof nodes
  root: string;
  stateVersion: number;
}
```

#### Get State Root
```typescript
GET /state/root
Response: {
  root: string;              // Current PMT root hash
  stateVersion: number;      // Matches on-chain StateAnchor.stateVersion
  lastMatchId: string;       // Most recent match that produced this root
  timestamp: number;
}
```

#### Verify Proof (Client-Side Helper)
```typescript
POST /verify/proof
Request: {
  root: string;
  key: string;
  value: string;
  proof: string[];
}
Response: {
  valid: boolean;
  error: string | null;
}

// Note: This is a convenience endpoint. Users SHOULD verify
// proofs client-side for trustless verification.
```

### Contract Events

```solidity
// MarketFactory
event MarketCreated(bytes32 indexed marketId, string question, string[] outcomes, uint256 resolutionTime);
event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome);

// OrderQueue
event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload);
event OrderCancelled(bytes32 indexed orderId);

// PrivateToken
event BalancesUpdated(uint256 indexed batchId, bytes32 stateRoot);
event Deposit(address indexed user, uint256 amount);
event WithdrawalRequested(address indexed user, bytes32 commitmentHash);

// StateAnchor (PMT Root Commits)
event StateUpdated(uint256 indexed version, bytes32 indexed newRoot, bytes32 indexed previousRoot, bytes32 matchId);
```

---

## Open Questions

### Resolved
- Market type: Categorical (up to 10 outcomes)
- Privacy approach: Single TEE (tokens + matching)
- Trading mechanism: Per-outcome order books
- Chain: Arbitrum
- Oracle: iExec native

### To Investigate
1. **iExec callback pattern**: Exact mechanism for TEE → contract calls
2. **Nocturne fork requirements**: What modifications needed for our use case
3. **Cross-chain deposits**: LayerZero integration complexity
4. **Gas sponsorship**: Who pays for TEE callbacks?
5. **Latency benchmarks**: Expected order processing time

### Future Considerations
1. Multi-market support and cross-market positions
2. AMM mode for low-liquidity markets
3. Governance token and fee sharing
4. Mobile-friendly key management
5. Regulatory compliance options

---

## Glossary

| Term | Definition |
|------|------------|
| TEE | Trusted Execution Environment - isolated compute enclave |
| MPT | Merkle Patricia Trie - verifiable key-value store |
| Outcome | One possible result of a prediction market |
| Share | Unit of ownership in an outcome (pays 1.0 if wins, 0 if loses) |
| Spread | Difference between best bid and best ask prices |
| Resolution | Process of determining winning outcome |
| Settlement | Process of paying out winners |
| Attestation | Cryptographic proof of TEE integrity |

---

## Sequence Diagrams

### Order Submission & Matching Flow

```
┌──────┐          ┌──────────┐         ┌─────┐          ┌───────────┐
│ User │          │OrderQueue│         │ TEE │          │StateAnchor│
└──┬───┘          └────┬─────┘         └──┬──┘          └─────┬─────┘
   │                   │                  │                   │
   │ 1. Encrypt order  │                  │                   │
   │ with TEE pubkey   │                  │                   │
   │                   │                  │                   │
   │ 2. submitOrder()  │                  │                   │
   │──────────────────>│                  │                   │
   │                   │                  │                   │
   │                   │ 3. emit          │                   │
   │                   │ OrderSubmitted   │                   │
   │                   │─────────────────>│                   │
   │                   │                  │                   │
   │                   │                  │ 4. Decrypt order  │
   │                   │                  │ 5. Validate       │
   │                   │                  │ 6. Match in PMT   │
   │                   │                  │ 7. Update state   │
   │                   │                  │                   │
   │                   │                  │ 8. commitRoot()   │
   │                   │                  │──────────────────>│
   │                   │                  │                   │
   │                   │                  │                   │ 9. Store root
   │                   │                  │                   │ 10. emit
   │                   │                  │                   │ StateUpdated
   │                   │                  │<──────────────────│
   │                   │                  │                   │
   │ 11. Get encrypted │                  │                   │
   │ execution result  │                  │                   │
   │<─────────────────────────────────────│                   │
   │                   │                  │                   │
   │ 12. Decrypt with  │                  │                   │
   │ user private key  │                  │                   │
   │                   │                  │                   │
```

### Proof Verification Flow

```
┌──────┐          ┌─────┐          ┌───────────┐
│ User │          │ TEE │          │StateAnchor│
└──┬───┘          └──┬──┘          └─────┬─────┘
   │                 │                   │
   │ 1. GET /proof/  │                   │
   │ order/{orderId} │                   │
   │────────────────>│                   │
   │                 │                   │
   │                 │ 2. Generate       │
   │                 │ Merkle proof      │
   │                 │                   │
   │ 3. Return proof │                   │
   │ + root + value  │                   │
   │<────────────────│                   │
   │                 │                   │
   │ 4. Query currentRoot               │
   │─────────────────────────────────────>
   │                 │                   │
   │ 5. Return on-chain root            │
   │<─────────────────────────────────────
   │                 │                   │
   │ 6. Compare roots│                   │
   │ 7. Verify proof │                   │
   │ locally (client)│                   │
   │                 │                   │
   │ [VERIFIED or    │                   │
   │  INVALID]       │                   │
   │                 │                   │
```

### Market Resolution & Settlement Flow

```
┌────────┐     ┌─────────────┐     ┌─────┐     ┌────────────┐     ┌───────────┐
│ Oracle │     │MarketFactory│     │ TEE │     │PrivateToken│     │StateAnchor│
└───┬────┘     └──────┬──────┘     └──┬──┘     └─────┬──────┘     └─────┬─────┘
    │                 │               │              │                  │
    │ 1. Resolution   │               │              │                  │
    │ time reached    │               │              │                  │
    │                 │               │              │                  │
    │ 2. Fetch result │               │              │                  │
    │ from source     │               │              │                  │
    │                 │               │              │                  │
    │ 3. Submit result│               │              │                  │
    │ to TEE with     │               │              │                  │
    │ attestation     │               │              │                  │
    │────────────────────────────────>│              │                  │
    │                 │               │              │                  │
    │                 │               │ 4. Verify    │                  │
    │                 │               │ attestation  │                  │
    │                 │               │              │                  │
    │                 │               │ 5. Calculate │                  │
    │                 │               │ all payouts  │                  │
    │                 │               │ in PMT       │                  │
    │                 │               │              │                  │
    │                 │               │ 6. Clear     │                  │
    │                 │               │ positions    │                  │
    │                 │               │              │                  │
    │                 │               │ 7. Update    │                  │
    │                 │               │ balances     │                  │
    │                 │               │              │                  │
    │                 │               │ 8. batchUpdateBalances()        │
    │                 │               │─────────────>│                  │
    │                 │               │              │                  │
    │                 │               │ 9. commitRoot()                 │
    │                 │               │─────────────────────────────────>
    │                 │               │              │                  │
    │                 │ 10. resolveMarket()         │                  │
    │                 │<──────────────│              │                  │
    │                 │               │              │                  │
    │                 │ 11. emit      │              │                  │
    │                 │ MarketResolved│              │                  │
    │                 │               │              │                  │
```

### Deposit & Withdrawal Flow

```
┌──────┐          ┌────────────┐         ┌─────┐          ┌───────────┐
│ User │          │PrivateToken│         │ TEE │          │StateAnchor│
└──┬───┘          └─────┬──────┘         └──┬──┘          └─────┬─────┘
   │                    │                   │                   │
   │ === DEPOSIT ===    │                   │                   │
   │                    │                   │                   │
   │ 1. deposit(100 USDC)                   │                   │
   │───────────────────>│                   │                   │
   │                    │                   │                   │
   │                    │ 2. Transfer USDC  │                   │
   │                    │ 3. emit Deposit   │                   │
   │                    │──────────────────>│                   │
   │                    │                   │                   │
   │                    │                   │ 4. Update user    │
   │                    │                   │ balance in PMT    │
   │                    │                   │                   │
   │                    │                   │ 5. commitRoot()   │
   │                    │                   │──────────────────>│
   │                    │                   │                   │
   │                    │                   │                   │
   │ === WITHDRAWAL === │                   │                   │
   │                    │                   │                   │
   │ 6. Request withdrawal                  │                   │
   │ (encrypted amount) │                   │                   │
   │───────────────────────────────────────>│                   │
   │                    │                   │                   │
   │                    │                   │ 7. Verify balance │
   │                    │                   │ 8. Deduct from PMT│
   │                    │                   │ 9. Generate proof │
   │                    │                   │                   │
   │                    │                   │ 10. commitRoot()  │
   │                    │                   │──────────────────>│
   │                    │                   │                   │
   │                    │ 11. Process       │                   │
   │                    │ withdrawal        │                   │
   │                    │<──────────────────│                   │
   │                    │                   │                   │
   │ 12. Receive USDC   │                   │                   │
   │<───────────────────│                   │                   │
   │                    │                   │                   │
```

---

## Error Handling & Failure Modes

### Error Categories

| Category | Severity | Examples |
|----------|----------|----------|
| User Error | Low | Invalid price, insufficient balance, bad signature |
| Network Error | Medium | RPC failure, event missed, tx reverted |
| TEE Error | High | Enclave crash, attestation failure |
| State Error | Critical | PMT corruption, root mismatch |

### User Errors

#### Invalid Order Parameters
```typescript
// Validation in TEE after decryption
function validateOrder(order: OrderPayload): ValidationResult {
  const errors: string[] = [];

  // Price bounds
  if (order.price < 0.01 || order.price > 0.99) {
    errors.push('INVALID_PRICE: Must be between 0.01 and 0.99');
  }

  // Amount bounds
  if (order.amount <= 0) {
    errors.push('INVALID_AMOUNT: Must be positive');
  }

  // Outcome exists
  if (order.outcomeIndex >= market.outcomes.length) {
    errors.push('INVALID_OUTCOME: Outcome index out of bounds');
  }

  // Market is open
  if (market.resolved || Date.now() > market.resolutionTime) {
    errors.push('MARKET_CLOSED: Cannot place orders on resolved/expired market');
  }

  return { valid: errors.length === 0, errors };
}

// Response to user (encrypted)
{
  status: 'REJECTED',
  errors: ['INVALID_PRICE: Must be between 0.01 and 0.99'],
  orderId: null
}
```

#### Insufficient Balance
```typescript
// Before placing order, check balance in PMT
async function checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
  const balanceKey = `user:${userId}:balance`;
  const balanceData = await trie.get(Buffer.from(balanceKey));

  if (!balanceData) return false;

  const balance = JSON.parse(balanceData.toString());
  return balance.available >= requiredAmount;
}

// Error response
{
  status: 'REJECTED',
  errors: ['INSUFFICIENT_BALANCE: Required 100, available 50'],
  orderId: null
}
```

#### Invalid Signature
```typescript
// Verify signature before processing
function verifyOrderSignature(order: EncryptedOrder): boolean {
  const message = keccak256(
    encodePacked(order.marketId, order.encryptedPayload, order.timestamp)
  );
  const recoveredAddress = recoverAddress(message, order.signature);
  return recoveredAddress === order.user;
}

// Rejection (not encrypted - can't identify user)
// Simply drop the order, emit no event
```

### Network Errors

#### Missed Events (TEE didn't see order submission)
```typescript
// Recovery: Periodic sync from contract state
async function syncMissedOrders(): Promise<void> {
  const lastProcessedBlock = await getLastProcessedBlock();
  const currentBlock = await provider.getBlockNumber();

  // Query historical events
  const events = await orderQueue.queryFilter(
    orderQueue.filters.OrderSubmitted(),
    lastProcessedBlock + 1,
    currentBlock
  );

  for (const event of events) {
    if (!await isOrderProcessed(event.args.orderId)) {
      await processOrder(event.args);
    }
  }

  await setLastProcessedBlock(currentBlock);
}

// Run on TEE startup and periodically
setInterval(syncMissedOrders, 60_000); // Every minute
```

#### Root Commit Transaction Failure
```typescript
// Retry logic with exponential backoff
async function commitRootWithRetry(
  newRoot: string,
  matchId: string,
  maxRetries: number = 3
): Promise<void> {
  let attempt = 0;
  let lastError: Error;

  while (attempt < maxRetries) {
    try {
      const tx = await stateAnchor.commitRoot(newRoot, matchId, attestation);
      await tx.wait(2); // Wait for 2 confirmations
      return;
    } catch (error) {
      lastError = error;
      attempt++;
      await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }

  // After max retries, enter recovery mode
  await enterRecoveryMode('ROOT_COMMIT_FAILED', lastError);
}
```

#### RPC Node Failure
```typescript
// Multiple RPC endpoints with fallback
const RPC_ENDPOINTS = [
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum-one.public.blastapi.io',
  'https://rpc.ankr.com/arbitrum',
];

async function getProvider(): Promise<Provider> {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const provider = new JsonRpcProvider(endpoint);
      await provider.getBlockNumber(); // Health check
      return provider;
    } catch {
      continue;
    }
  }
  throw new Error('ALL_RPC_ENDPOINTS_FAILED');
}
```

### TEE Errors

#### Enclave Crash / Restart
```typescript
// State recovery from on-chain root + IPFS snapshot
async function recoverState(): Promise<void> {
  // 1. Get latest committed root from chain
  const onChainRoot = await stateAnchor.currentRoot();
  const stateVersion = await stateAnchor.stateVersion();

  // 2. Fetch state snapshot from IPFS
  const snapshotCid = await getSnapshotCid(stateVersion);
  const encryptedSnapshot = await ipfs.get(snapshotCid);

  // 3. Decrypt snapshot with sealed key
  const snapshot = await decryptWithSealedKey(encryptedSnapshot);

  // 4. Rebuild trie from snapshot
  trie = await Trie.create({ root: hexToBytes(onChainRoot) });
  await trie.fromSnapshot(snapshot);

  // 5. Verify root matches
  if (bytesToHex(trie.root()) !== onChainRoot) {
    throw new Error('STATE_RECOVERY_FAILED: Root mismatch');
  }

  // 6. Replay any events since snapshot
  await syncMissedOrders();

  console.log(`State recovered at version ${stateVersion}`);
}
```

#### Attestation Failure
```typescript
// If TEE can't generate valid attestation
async function handleAttestationFailure(): Promise<void> {
  // 1. Log the failure (encrypted log)
  await logSecure('ATTESTATION_FAILURE', { timestamp: Date.now() });

  // 2. Pause new order processing
  await pauseOrderProcessing();

  // 3. Alert operators
  await notifyOperators('TEE_ATTESTATION_FAILURE');

  // 4. Attempt re-attestation after delay
  await sleep(30_000);
  const newAttestation = await generateAttestation();

  if (newAttestation.valid) {
    await resumeOrderProcessing();
  } else {
    // Requires manual intervention
    await enterMaintenanceMode();
  }
}
```

### State Errors

#### PMT Root Mismatch (TEE vs On-Chain)
```typescript
// Detected during proof generation or periodic check
async function verifyStateConsistency(): Promise<boolean> {
  const teeRoot = bytesToHex(trie.root());
  const chainRoot = await stateAnchor.currentRoot();

  if (teeRoot !== chainRoot) {
    // CRITICAL: State divergence
    await logSecure('STATE_DIVERGENCE', {
      teeRoot,
      chainRoot,
      teeVersion: currentVersion,
      chainVersion: await stateAnchor.stateVersion(),
    });

    // Attempt recovery from chain state
    await recoverState();

    return false;
  }

  return true;
}

// Run after every root commit and periodically
```

#### PMT Corruption
```typescript
// Detected when trie operations fail
async function handleTrieCorruption(error: Error): Promise<void> {
  await logSecure('TRIE_CORRUPTION', { error: error.message });

  // 1. Stop all order processing
  await pauseOrderProcessing();

  // 2. Get last known good root from chain
  const lastGoodVersion = await findLastGoodVersion();
  const lastGoodRoot = await stateAnchor.getRootAtVersion(lastGoodVersion);

  // 3. Rebuild from snapshot
  const snapshot = await getSnapshotAtVersion(lastGoodVersion);
  trie = await Trie.create({ root: hexToBytes(lastGoodRoot) });
  await trie.fromSnapshot(snapshot);

  // 4. Replay events from lastGoodVersion to current
  await replayEventsFromVersion(lastGoodVersion);

  // 5. Resume if successful
  await resumeOrderProcessing();
}
```

### Recovery Procedures

#### Full State Recovery Procedure
```
1. DETECT: Identify state inconsistency or corruption
2. PAUSE: Stop all order processing, emit SystemPaused event
3. FETCH: Get latest committed root from StateAnchor
4. RESTORE: Load encrypted snapshot from IPFS
5. DECRYPT: Use sealed enclave key to decrypt snapshot
6. REBUILD: Reconstruct PMT from snapshot data
7. VERIFY: Confirm rebuilt root matches on-chain root
8. REPLAY: Process any events between snapshot and current block
9. VALIDATE: Run consistency checks on recovered state
10. RESUME: Re-enable order processing, emit SystemResumed
```

#### Graceful Degradation Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Normal | All systems operational | Full functionality |
| Read-Only | Root commit failing | Accept orders, delay commits |
| Paused | TEE error | Queue orders, don't process |
| Maintenance | Critical failure | Reject all operations |

```typescript
enum SystemMode {
  NORMAL = 'NORMAL',
  READ_ONLY = 'READ_ONLY',
  PAUSED = 'PAUSED',
  MAINTENANCE = 'MAINTENANCE',
}

async function handleSystemMode(mode: SystemMode): Promise<void> {
  switch (mode) {
    case SystemMode.READ_ONLY:
      // Process orders but queue root commits
      await queueRootCommits();
      break;

    case SystemMode.PAUSED:
      // Queue incoming orders, don't match
      await enableOrderQueue();
      await disableMatching();
      break;

    case SystemMode.MAINTENANCE:
      // Reject everything
      await rejectAllRequests('SYSTEM_MAINTENANCE');
      break;
  }

  // Emit mode change event for monitoring
  await emitSystemModeChange(mode);
}
```

### Error Response Format

All API errors follow a consistent format:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable code
    message: string;        // Human-readable message
    details?: object;       // Additional context
    recoverable: boolean;   // Can user retry?
    suggestedAction?: string;
  };
  requestId: string;        // For support/debugging
  timestamp: number;
}

// Example
{
  success: false,
  error: {
    code: 'INSUFFICIENT_BALANCE',
    message: 'Not enough balance to place this order',
    details: {
      required: 100,
      available: 50,
      currency: 'USDC'
    },
    recoverable: true,
    suggestedAction: 'Deposit more funds or reduce order size'
  },
  requestId: 'req_abc123',
  timestamp: 1706400000000
}
```

---

## References

- [iExec Documentation](https://docs.iex.ec/)
- [Nocturne Private Token](https://github.com/nocturne-protocol/private-token-contract)
- [Polymarket Architecture](https://docs.polymarket.com/)
- [Intel SGX](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions/overview.html)
- [NaCl Cryptography](https://nacl.cr.yp.to/)
- [@ethereumjs/trie](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/trie)
