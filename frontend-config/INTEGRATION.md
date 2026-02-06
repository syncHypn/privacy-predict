# iPred Frontend Integration Guide

## Quick Start

```ts
import config from "./contracts.json";
import { createPublicClient, http, getContract } from "viem";
import { arbitrumSepolia } from "viem/chains";

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(config.network.rpcUrl),
});

const marketFactory = getContract({
  address: config.contracts.MarketFactory.address,
  abi: config.contracts.MarketFactory.abi,
  client,
});
```

## Contract Addresses & ABIs

All in `contracts.json`. Contracts deployed on **Arbitrum Sepolia** (chainId `421614`).

| Contract | Purpose | User Interactions |
|---|---|---|
| **MarketFactory** | Market CRUD, outcomes, resolution | `getMarket()`, `getMarketCount()`, `getOutcomes()` |
| **OrderQueue** | Encrypted order submission | `submitOrder()`, `cancelOrder()`, `getUserOrders()` |
| **PrivateToken** | Deposit collateral, encrypted balances | `deposit()`, `requestWithdrawal()`, `getEncryptedBalance()` |
| **StateAnchor** | TEE state root anchoring | `currentRoot()`, `stateVersion()` (read-only for frontend) |
| **CallbackReceiver** | iExec callback relay | Not called by frontend directly |

## User Actions (Write Calls)

### 1. Deposit Collateral

```ts
// User must first approve PrivateToken to spend their USDC
await usdcContract.write.approve([config.contracts.PrivateToken.address, amount]);
// Then deposit
await privateToken.write.deposit([amount]); // amount in 6 decimals (USDC)
```

Emits: `Deposit(user, amount, commitment)`

### 2. Submit Order

Orders are encrypted with the TEE public key before submission.

```ts
// encryptedPayload = encrypt({ side: "BUY", outcomeIndex: 0, amount: "100000000" })
const orderId = await orderQueue.write.submitOrder([marketId, encryptedPayload]);
```

Emits: `OrderSubmitted(orderId, marketId, user, encryptedPayload, timestamp)`

### 3. Cancel Order

```ts
await orderQueue.write.cancelOrder([orderId]);
```

Emits: `OrderCancelled(orderId, user)`

### 4. Request Withdrawal

```ts
// commitmentHash = keccak256(abi.encodePacked(user, amount, nonce))
// encryptedAmount = encrypt(amount) with TEE key
await privateToken.write.requestWithdrawal([commitmentHash, encryptedAmount]);
```

Emits: `WithdrawalRequested(user, commitmentHash)`

## Read Calls

### List All Markets

```ts
const count = await marketFactory.read.getMarketCount();
const markets = [];
for (let i = 0; i < count; i++) {
  const id = await marketFactory.read.getMarketIdAt([i]);
  const market = await marketFactory.read.getMarket([id]);
  markets.push(market);
}
```

### Get Market Prices (from IPFS)

Prices are NOT on-chain. They come from the TEE's `public-state.json` output on IPFS.

```ts
// Fetch latest public-state.json from IPFS (CID from latest TEE run)
const res = await fetch(`https://gateway.pinata.cloud/ipfs/${latestStateCid}`);
const publicState = await res.json();

// Compute prices client-side
function computePrices(pool) {
  const usdc = Number(pool.usdc);
  const yes = Number(pool.yes);
  const no = Number(pool.no);
  const pYes = usdc / yes;
  const pNo = usdc / no;
  const total = pYes + pNo;
  return {
    yes: pYes / total,  // probability 0-1
    no: pNo / total,
  };
}

const marketPool = publicState.pools[marketId];
const prices = computePrices(marketPool);
// prices.yes = 0.60 means 60% probability
```

### Get User Orders

```ts
const orderIds = await orderQueue.read.getUserOrders([userAddress]);
const orders = await Promise.all(
  orderIds.map((id) => orderQueue.read.getOrder([id]))
);
// Each order: { orderId, marketId, user, encryptedPayload, timestamp }
// Note: encryptedPayload is opaque to the frontend
```

### Get User Balance (Encrypted)

```ts
const encBalance = await privateToken.read.getEncryptedBalance([userAddress]);
// This is encrypted bytes - frontend cannot decrypt
// Use optimistic local tracking instead (see below)
```

## Event Listening

```ts
// New TEE round completed - refetch prices from IPFS
client.watchContractEvent({
  address: config.contracts.StateAnchor.address,
  abi: config.contracts.StateAnchor.abi,
  eventName: "StateUpdated",
  onLogs: (logs) => {
    const { version, newRoot, matchId } = logs[0].args;
    // Trigger IPFS re-fetch for new public-state.json
  },
});

// Deposit confirmed
client.watchContractEvent({
  address: config.contracts.PrivateToken.address,
  abi: config.contracts.PrivateToken.abi,
  eventName: "Deposit",
  args: { user: userAddress },
  onLogs: (logs) => {
    // Update local balance tracker
  },
});

// Order submitted
client.watchContractEvent({
  address: config.contracts.OrderQueue.address,
  abi: config.contracts.OrderQueue.abi,
  eventName: "OrderSubmitted",
  args: { user: userAddress },
  onLogs: (logs) => {
    // Update order list UI
  },
});
```

## Balance Tracking (Optimistic)

Since balances are encrypted on-chain, track locally:

```ts
let localBalance = 0n;

// On deposit tx success
localBalance += depositAmount;

// On order fill (after StateUpdated event)
// Estimate: subtract order amount for BUY, add for SELL
// This is approximate until a TEE balance query service is available

// On withdrawal processed
localBalance -= withdrawalAmount;
```

## Collateral Token

The USDC address is available on-chain:
```ts
const usdcAddress = await privateToken.read.collateralToken();
```

All amounts use 6 decimals (USDC standard).

## Public State JSON Schema

```json
{
  "pools": {
    "<marketId>": {
      "usdc": "1000000000",
      "yes": "800000000",
      "no": "1200000000"
    }
  },
  "version": 3,
  "timestamp": 1707200000000
}
```

Reserve values are strings representing BigInt with 6 decimals (USDC precision).
