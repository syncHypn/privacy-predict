# iPred Deployment Guide - Arbitrum Sepolia

## Deployed Contracts (Current)

| Contract | Address |
|----------|---------|
| MarketFactory | `0x3555B28E59e32b6D0d81DE5fF123cbe73d518592` |
| OrderQueue | `0x67b830886A47BbB5f2019eb129E81F217Ec56f09` |
| StateAnchor | `0x074Af457Ea1C58752705ce157f6892E5bBFc5988` |
| PrivateToken | `0x7402C579e7A661b3fdA0553E511D14Bf0aadcab9` |
| Collateral (USDC) | `0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d` |
| TEE Address | `0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B` |
| Oracle Address | `0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38` |

**Test Market ID:** `0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834`

---

## Prerequisites

```bash
# Load environment
source .env

# Export contract addresses for convenience
export MARKET_FACTORY=$MARKET_FACTORY_ADDRESS
export ORDER_QUEUE=$ORDER_QUEUE_ADDRESS
export STATE_ANCHOR=$STATE_ANCHOR_ADDRESS
export PRIVATE_TOKEN=$PRIVATE_TOKEN_ADDRESS
export COLLATERAL=$COLLATERAL_ADDRESS
export RPC_URL=$ARBITRUM_SEPOLIA_RPC_URL
```

---

## Architecture Overview

```
User Actions:
  deposit(amount)     → PrivateToken   → Deposit event      → TEE processes
  submitOrder(...)    → OrderQueue     → OrderSubmitted     → TEE processes
  requestWithdrawal() → PrivateToken   → WithdrawalRequested→ TEE processes

TEE Callbacks:
  batchUpdateBalances() → PrivateToken (update encrypted balances)
  processWithdrawal()   → PrivateToken (send collateral)

Market Management:
  createMarket()   → MarketFactory (owner/whitelisted only)
  resolveMarket()  → MarketFactory (oracle only)
```

---

## Testing the Deployed Contracts

### 1. Check Contract State

```bash
# MarketFactory
cast call $MARKET_FACTORY "getMarketCount()" --rpc-url $RPC_URL
cast call $MARKET_FACTORY "oracle()" --rpc-url $RPC_URL

# PrivateToken
cast call $PRIVATE_TOKEN "totalDeposited()" --rpc-url $RPC_URL
cast call $PRIVATE_TOKEN "collateralToken()" --rpc-url $RPC_URL
cast call $PRIVATE_TOKEN "teeAddress()" --rpc-url $RPC_URL

# OrderQueue
cast call $ORDER_QUEUE "marketFactory()" --rpc-url $RPC_URL
```

### 2. Create a New Market

```bash
# Whitelist yourself first (as owner)
cast send $MARKET_FACTORY "addToWhitelist(address)" YOUR_ADDRESS \
  --rpc-url $RPC_URL --account sepolia

# Create market (resolution time must be in the future)
cast send $MARKET_FACTORY \
  "createMarket(string,string[],uint256)" \
  "Will ETH hit 5k by June 2026?" \
  '["Yes","No"]' \
  1782000000 \
  --rpc-url $RPC_URL --account sepolia
```

### 3. Submit an Order

```bash
export MARKET_ID=$TEST_MARKET_ID

# Submit encrypted order (payload encrypted with TEE public key)
cast send $ORDER_QUEUE \
  "submitOrder(bytes32,bytes)" \
  $MARKET_ID \
  0x<encrypted_payload> \
  --rpc-url $RPC_URL --account sepolia
```

### 4. Deposit Collateral

```bash
# Check USDC balance
cast call $COLLATERAL "balanceOf(address)" YOUR_ADDRESS --rpc-url $RPC_URL

# Approve PrivateToken
cast send $COLLATERAL \
  "approve(address,uint256)" \
  $PRIVATE_TOKEN \
  1000000000 \
  --rpc-url $RPC_URL --account sepolia

# Deposit (amount in 6 decimals, e.g., 10000000 = 10 USDC)
cast send $PRIVATE_TOKEN \
  "deposit(uint256)" \
  10000000 \
  --rpc-url $RPC_URL --account sepolia
```

### 5. Request Withdrawal

```bash
# Request withdrawal with encrypted amount
cast send $PRIVATE_TOKEN \
  "requestWithdrawal(bytes32,bytes)" \
  0x<commitment_hash> \
  0x<encrypted_amount> \
  --rpc-url $RPC_URL --account sepolia
```

---

## Redeploying Contracts

### Deploy MarketFactory

```bash
forge create src/MarketFactory.sol:MarketFactory \
  --constructor-args $ORACLE_ADDRESS \
  --rpc-url $RPC_URL \
  --account sepolia
```

### Deploy OrderQueue

```bash
forge create src/OrderQueue.sol:OrderQueue \
  --constructor-args $MARKET_FACTORY \
  --rpc-url $RPC_URL \
  --account sepolia
```

### Deploy StateAnchor

```bash
forge create src/StateAnchor.sol:StateAnchor \
  --constructor-args $TEE_ADDRESS \
  --rpc-url $RPC_URL \
  --account sepolia
```

### Deploy PrivateToken

```bash
forge create src/PrivateToken.sol:PrivateToken \
  --constructor-args $COLLATERAL $TEE_ADDRESS \
  --rpc-url $RPC_URL \
  --account sepolia
```

---

## TEE Integration

The TEE monitors events and processes operations:

### Events to Monitor

| Contract | Event | TEE Action |
|----------|-------|------------|
| PrivateToken | `Deposit(user, amount, commitment)` | Update encrypted balance |
| PrivateToken | `WithdrawalRequested(user, commitment)` | Verify and process withdrawal |
| OrderQueue | `OrderSubmitted(orderId, marketId, user, payload, timestamp)` | Decrypt, execute, update state |
| MarketFactory | `MarketResolved(marketId, winningOutcome)` | Process redemptions |

### TEE Callbacks

```solidity
// Update balances after deposit/trade
PrivateToken.batchUpdateBalances(
    address[] users,
    bytes[] newEncryptedBalances,
    bytes32 stateRoot
)

// Process verified withdrawal
PrivateToken.processWithdrawal(
    address user,
    uint256 amount,
    bytes proof
)

// Anchor state root
StateAnchor.anchorState(bytes32 stateRoot)
```

---

## Verification

```bash
# Verify MarketFactory
forge verify-contract $MARKET_FACTORY \
  src/MarketFactory.sol:MarketFactory \
  --constructor-args $(cast abi-encode "constructor(address)" $ORACLE_ADDRESS) \
  --chain arbitrum-sepolia

# Verify OrderQueue
forge verify-contract $ORDER_QUEUE \
  src/OrderQueue.sol:OrderQueue \
  --constructor-args $(cast abi-encode "constructor(address)" $MARKET_FACTORY) \
  --chain arbitrum-sepolia

# Verify PrivateToken
forge verify-contract $PRIVATE_TOKEN \
  src/PrivateToken.sol:PrivateToken \
  --constructor-args $(cast abi-encode "constructor(address,address)" $COLLATERAL $TEE_ADDRESS) \
  --chain arbitrum-sepolia
```

---

## Quick Test Script

```bash
#!/bin/bash
source .env

export MARKET_FACTORY=$MARKET_FACTORY_ADDRESS
export ORDER_QUEUE=$ORDER_QUEUE_ADDRESS
export PRIVATE_TOKEN=$PRIVATE_TOKEN_ADDRESS
export COLLATERAL=$COLLATERAL_ADDRESS
export RPC=$ARBITRUM_SEPOLIA_RPC_URL

echo "=== Contract State ==="
echo "Markets: $(cast call $MARKET_FACTORY 'getMarketCount()' --rpc-url $RPC)"
echo "Total Deposited: $(cast call $PRIVATE_TOKEN 'totalDeposited()' --rpc-url $RPC)"
echo "Collateral: $(cast call $PRIVATE_TOKEN 'collateralToken()' --rpc-url $RPC)"
```
