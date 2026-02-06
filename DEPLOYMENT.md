# iPred Deployment Guide

Deploy the iPred private prediction market protocol on Arbitrum Sepolia with iExec TEE.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Contract Addresses](#contract-addresses)
4. [Prerequisites](#prerequisites)
5. [Phase 1: Smart Contract Deployment](#phase-1-smart-contract-deployment)
6. [Phase 2: TEE iApp Setup](#phase-2-tee-iapp-setup)
7. [Phase 3: iApp Testing](#phase-3-iapp-testing)
8. [Phase 4: iApp Deployment](#phase-4-iapp-deployment)
9. [Phase 5: Configuration & Integration](#phase-5-configuration--integration)
10. [Phase 6: Orchestrator Setup](#phase-6-orchestrator-setup)
11. [Phase 7: End-to-End Testing](#phase-7-end-to-end-testing)
12. [Environment Variables](#environment-variables)
13. [Troubleshooting](#troubleshooting)

---

## Overview

iPred is a private prediction market protocol using:
- **Arbitrum Sepolia** for smart contracts and settlement
- **iExec TEE** (Trusted Execution Environment) for private order matching
- **Patricia Merkle Trie (PMT)** for encrypted state management
- **NaCl encryption** for order privacy

### System Flow

```
User                    Contracts                 TEE
  |                         |                      |
  |--- deposit() ---------> | (ConfidentialUSDC)   |
  |                         |--- Deposit event --->|
  |                         |                      |-- Update cUSDC balance
  |                         |                      |
  |--- buy() -------------> | (PredictionMarket)   |
  |    (encrypted amount)   |--- BuyRequested ---->|
  |                         |                      |-- Decrypt amount
  |                         |                      |-- Execute AMM swap
  |                         |                      |-- Update balances
  |                         |<-- updateBalances() -|
  |                         |<-- updatePrice() ----|
  |                         |                      |
  |--- sell() ------------> | (PredictionMarket)   |
  |    (encrypted amount)   |--- SellRequested --->|
  |                         |                      |-- Decrypt & execute
  |                         |                      |
  |--- redeem() ----------> | (PredictionMarket)   |
  |    (after resolution)   |--- RedeemRequested ->|
  |                         |                      |-- Calculate payout
  |                         |<-- updateBalances() -|
  |                         |                      |
  |--- withdraw() --------> | (ConfidentialUSDC)   |
  |                         |--- WithdrawReq ----->|
  |<-- processWithdrawal() -|<-- verify & approve -|
```

---

## Architecture

### Smart Contracts

| Contract | Purpose |
|----------|---------|
| **MarketFactory** | Creates and manages prediction markets |
| **PredictionMarket** | AMM for buy/sell/redeem of cYES/cNO |
| **ConfidentialUSDC** | Wraps USDC with encrypted balances |
| **ConfidentialOutcomeToken** | cYES/cNO tokens per market |
| **StateAnchor** | Anchors PMT state roots on-chain |
| **MockUSDC** | Test collateral token (6 decimals) |

### TEE Components

| Component | Purpose |
|-----------|---------|
| **EventListener** | Monitors BuyRequested, SellRequested, RedeemRequested events |
| **AMM** | Constant product market maker (x * y = k) |
| **StateManager** | Encrypted state with IPFS snapshots |
| **KeyManager** | TEE key derivation and encryption |
| **TokenCaller** | Updates on-chain balances and prices |

---

## Contract Addresses

### Arbitrum Sepolia

| Contract | Address |
|----------|---------|
| **MarketFactory** | `0x3555b28e59e32b6d0d81de5ff123cbe73d518592` |
| **OrderQueue** | `0x67b830886a47bbb5f2019eb129e81f217ec56f09` |
| **StateAnchor** | `0x074af457ea1c58752705ce157f6892e5bbfc5988` |
| **PrivateToken** | `0x7402c579e7a661b3fda0553e511d14bf0aadcab9` |
| **MockUSDC** | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

### Configuration

| Parameter | Value |
|-----------|-------|
| Network | Arbitrum Sepolia (Chain ID: 421614) |
| RPC URL | `https://sepolia-rollup.arbitrum.io/rpc` |
| TEE Wallet | `0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B` |
| iApp Address | `0xffad8b205e014988dfA6D51C03190b09A057BE90` |
| Docker Image | `romthpt/ipred-tee:0.0.7-tee-scone-5.9.1-v16-prod` |

---

## Prerequisites

### Software Requirements

```bash
# Foundry (Solidity toolchain)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Node.js 20+
node --version  # v20.x.x

# Docker (OrbStack recommended for macOS)
# Download from: https://orbstack.dev
docker --version
docker buildx inspect --bootstrap | grep -i platforms  # Must include linux/amd64

# iExec iApp CLI
npm install -g @iexec/iapp
```

### Accounts & Tokens

1. **Deployer wallet** with Arbitrum Sepolia ETH
   - Faucet: https://faucet.quicknode.com/arbitrum/sepolia

2. **TEE signer wallet** with Arbitrum Sepolia ETH
   - Used by TEE to submit transactions

3. **DockerHub account** (for pushing TEE images)
   - Required for `docker login`

---

## Phase 1: Smart Contract Deployment

### 1.1 Setup Environment

```bash
cd /path/to/iPred
cp .env.example .env

# Edit .env:
# PRIVATE_KEY=0x...
# ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
# ARBISCAN_API_KEY=...
```

### 1.2 Install & Build

```bash
forge install
forge build
```

### 1.3 Deploy Contracts

```bash
# Deploy ConfidentialUSDC
forge script script/DeployConfidentialUSDC.s.sol:DeployConfidentialUSDC \
  --fork-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --account sepolia

# Deploy PredictionMarket
CONFIDENTIAL_USDC_ADDRESS=0x4932bc0B94751fcC0Fc02F5bca5233E2Dc592F2A \
forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
  --fork-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --account sepolia
```

### 1.4 Create Market & Outcome Tokens

```bash
# Create market via MarketFactory
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "createMarket(string,string[],uint256)" \
  "Will ETH reach 10k by end of 2026?" \
  "[\"Yes\",\"No\"]" \
  $(date -d "2026-12-31" +%s) \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --account sepolia

# Deploy ConfidentialOutcomeTokens
PREDICTION_MARKET_ADDRESS=0x07913F426e09dEF7c7081AE7bCE5EfC1f5c8e78f \
MARKET_ID=0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880 \
forge script script/DeployOutcomeTokens.s.sol:DeployOutcomeTokens \
  --fork-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --account sepolia
```

---

## Phase 2: TEE iApp Setup

The iApp Generator handles TEE/SGX sconification automatically - no SCONE registry access needed.

### 2.1 Initialize iApp Project

```bash
cd ipred-tee
npm install
```

### 2.2 Project Structure

```
ipred-tee/
  src/app.js          # Main application logic
  Dockerfile          # Auto-generated for TEE
  iapp.config.json    # iApp configuration
  input/              # Input files directory
  output/             # Output files directory
  cache/              # Cache directory
  mock/               # Mock data for testing
```

### 2.3 Configure Application

Edit `src/app.js` to implement the prediction market TEE logic:
- Event listening for BuyRequested, SellRequested, RedeemRequested
- AMM calculations (constant product market maker)
- Encrypted state management
- On-chain balance updates

The iApp receives:
- **args**: Public parameters (market ID, action type)
- **protectedData**: Encrypted order data from users

---

## Phase 3: iApp Testing

### 3.1 Local Testing

```bash
cd ipred-tee

# Basic test
iapp test

# Test with arguments
iapp test --args "buy 0x89137be..."

# Test with protected data (mock)
iapp test --protectedData default
```

### 3.2 Create Mock Protected Data

```bash
# Create mock encrypted order data
iapp mock protectedData
```

### 3.3 Debug Output

Check `output/` directory for results and `computed.json` for execution status.

---

## Phase 4: iApp Deployment

### 4.1 Login to DockerHub

```bash
docker login
```

### 4.2 Deploy to iExec Network

```bash
cd ipred-tee

# Deploy to Arbitrum Sepolia (iExec network)
iapp deploy
```

Output:
```
Deploying iApp...
Building Docker image...
Pushing to DockerHub...
Sconifying for TEE...
Deploying to iExec...

iApp deployed at: 0xffad8b205e014988dfA6D51C03190b09A057BE90
```

### 4.3 Run on iExec Workers

```bash
# Execute the deployed iApp with market ID
iapp run --args "<market-id>"

# Debug mode (local execution)
iapp debug --args "<market-id>"
```

### 4.4 Debug Execution

```bash
# Get execution logs
iapp debug <taskId>
```

---

## Phase 5: Configuration & Integration

### 5.1 Authorize TEE on Contracts

```bash
TEE_WALLET=0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B

# StateAnchor
cast send 0x074af457ea1c58752705ce157f6892e5bbfc5988 \
  "setTEEAddress(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# OrderQueue
cast send 0x67b830886a47bbb5f2019eb129e81f217ec56f09 \
  "setTEEAddress(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# PrivateToken
cast send 0x7402c579e7a661b3fda0553e511d14bf0aadcab9 \
  "setTEEApp(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

### 5.2 Fund TEE Wallet

```bash
cast send $TEE_WALLET --value 0.1ether \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

### 5.3 Verify

```bash
# Check TEE address on StateAnchor
cast call 0x074af457ea1c58752705ce157f6892e5bbfc5988 \
  "teeAddress()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Check TEE wallet balance
cast balance $TEE_WALLET --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

---

## Phase 6: Orchestrator Setup

The orchestrator bridges on-chain events with TEE processing. It listens for contract events, processes them using iApp logic, and submits callbacks to update on-chain state.

### 6.1 Install Dependencies

```bash
cd orchestrator
npm install
```

### 6.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Arbitrum Sepolia RPC (for event listening)
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Wallet private key (TEE signer - for submitting callbacks)
PRIVATE_KEY=0x...

# Contract addresses on Arbitrum Sepolia
MARKET_FACTORY_ADDRESS=0x3555b28e59e32b6d0d81de5ff123cbe73d518592
ORDER_QUEUE_ADDRESS=0x67b830886a47bbb5f2019eb129e81f217ec56f09
STATE_ANCHOR_ADDRESS=0x074af457ea1c58752705ce157f6892e5bbfc5988
PRIVATE_TOKEN_ADDRESS=0x7402c579e7a661b3fda0553e511d14bf0aadcab9
MOCK_USDC_ADDRESS=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d

# Sealed key for encryption (base64 encoded, 32 bytes)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SEALED_KEY=...

# Polling interval in milliseconds (default: 5000)
POLL_INTERVAL=5000
```

### 6.3 Start the Orchestrator

```bash
npm start --prefix orchestrator
```

The orchestrator will:
1. Poll for new events (DepositRequested, BuyRequested, SellRequested, RedeemRequested)
2. Process events using AMM logic
3. Submit balance updates and price updates on-chain

---

## Phase 7: End-to-End Testing

With the orchestrator running, test the full flow.

### 7.1 Mint & Deposit Test USDC

```bash
# Mint MockUSDC (1000 USDC)
cast send 0xA2ec86e965eE5932a282D500fFeB98D2908960C6 \
  "mint(address,uint256)" $YOUR_ADDRESS 1000000000 \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Approve
cast send 0xA2ec86e965eE5932a282D500fFeB98D2908960C6 \
  "approve(address,uint256)" 0x4932bc0B94751fcC0Fc02F5bca5233E2Dc592F2A 1000000000 \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Deposit to get cUSDC (100 USDC)
cast send 0x4932bc0B94751fcC0Fc02F5bca5233E2Dc592F2A \
  "deposit(uint256)" 100000000 \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

The orchestrator will detect the DepositRequested event and update your encrypted cUSDC balance.

### 7.2 Buy Outcome Tokens

```bash
# Encrypt amount (10 cUSDC)
ENCRYPTED_AMOUNT=$(node orchestrator/scripts/encrypt-amount.js 10000000)

# Buy cYES tokens
cast send 0x07913F426e09dEF7c7081AE7bCE5EfC1f5c8e78f \
  "buy(bytes32,bool,bytes)" \
  0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880 \
  true \
  $ENCRYPTED_AMOUNT \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

The orchestrator will:
1. Decrypt the amount
2. Execute AMM swap (cUSDC -> cYES)
3. Update your encrypted cUSDC and cYES balances
4. Update the on-chain price

### 7.3 Sell Outcome Tokens

```bash
# Encrypt amount (5 cYES)
ENCRYPTED_AMOUNT=$(node orchestrator/scripts/encrypt-amount.js 5000000)

# Sell cYES tokens
cast send 0x07913F426e09dEF7c7081AE7bCE5EfC1f5c8e78f \
  "sell(bytes32,bool,bytes)" \
  0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880 \
  true \
  $ENCRYPTED_AMOUNT \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

### 7.4 Check Prices

```bash
cast call 0x07913F426e09dEF7c7081AE7bCE5EfC1f5c8e78f \
  "getPrice(bytes32)(uint256,uint256)" \
  0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

Returns `(yesPrice, noPrice)` in basis points (e.g., 5049, 4951 = YES 50.49%, NO 49.51%).

### 7.5 Check Encrypted Balances

```bash
# Check cUSDC balance (encrypted)
cast call 0x4932bc0B94751fcC0Fc02F5bca5233E2Dc592F2A \
  "encryptedBalanceOf(address)(bytes)" $YOUR_ADDRESS \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Check cYES balance (encrypted)
cast call 0xc9001569ccfb043Dc9a897A8F0a058c13D3994F6 \
  "encryptedBalanceOf(address)(bytes)" $YOUR_ADDRESS \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

---

## Environment Variables

### iApp Configuration

Configuration is managed through `iapp.config.json` and protected data:

| Config | Description | Location |
|--------|-------------|----------|
| `defaultChain` | Target network (bellecour) | iapp.config.json |
| `projectName` | iApp name | iapp.config.json |
| `walletPrivateKey` | Deployment wallet | iapp.config.json |

### Runtime Parameters

Passed via `iapp run` command:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--args` | Public arguments (market ID) | `--args "<market-id>"` |

---

## Troubleshooting

### iApp build fails

```bash
# Verify Docker supports linux/amd64
docker buildx inspect --bootstrap | grep -i platforms

# If missing, update Docker or use OrbStack
```

### "Insufficient funds" on deploy

Ensure the iApp wallet has ETH on Arbitrum Sepolia:
- Faucet: https://faucet.quicknode.com/arbitrum/sepolia

Check balance:
```bash
iapp wallet show
```

### iApp test fails

```bash
# Check Docker is running
docker info

# Rebuild the image
iapp test --rebuild
```

### "NotTEE" error on contracts

TEE wallet not authorized:

```bash
TEE_WALLET=0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B

# StateAnchor
cast send 0x074af457ea1c58752705ce157f6892e5bbfc5988 \
  "setTEEAddress(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# OrderQueue
cast send 0x67b830886a47bbb5f2019eb129e81f217ec56f09 \
  "setTEEAddress(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# PrivateToken
cast send 0x7402c579e7a661b3fda0553e511d14bf0aadcab9 \
  "setTEEApp(address)" $TEE_WALLET \
  --account sepolia --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

### Debug execution issues

```bash
# Get detailed logs for a task
iapp debug <taskId>
```

### Protected data issues

Ensure protected data is properly encrypted using iExec DataProtector:
- https://docs.iex.ec/tools/dataprotector

---

## Orchestrator Architecture

The orchestrator (`/orchestrator`) provides the bridge between on-chain events and TEE processing:

```
Arbitrum Sepolia                    Orchestrator
       |                                 |
       |--- DepositRequested ----------->|
       |                                 |-- Decrypt amount
       |                                 |-- Encrypt balance
       |<-- updateBalance() -------------|
       |                                 |
       |--- BuyRequested --------------->|
       |                                 |-- Decrypt amount
       |                                 |-- Execute AMM swap
       |                                 |-- Update balances
       |<-- updateBalance(cUSDC) --------|
       |<-- updateBalance(cYES) ---------|
       |<-- updatePrice() ---------------|
       |                                 |
       |--- SellRequested -------------->|
       |                                 |-- Same flow as buy
       |<-- updateBalance() x2 ----------|
       |<-- updatePrice() ---------------|
```

### Components

| File | Purpose |
|------|---------|
| `src/index.js` | Main entry point |
| `src/event-listener.js` | Polls for contract events |
| `src/state-manager.js` | EncryptionManager and ConfidentialAMM |
| `src/action-handler.js` | Processes deposit/buy/sell/redeem events |
| `src/callback-submitter.js` | Submits on-chain transactions |
| `scripts/encrypt-amount.js` | Helper to encrypt amounts for orders |

---

## References

- [SPEC.md](docs/SPEC.md) - Project specification
- [ENCRYPTION.md](docs/ENCRYPTION.md) - Encryption architecture
- [orchestrator/README.md](orchestrator/README.md) - Orchestrator documentation
- [iExec TEE Docs](https://docs.iex.ec/) - iExec documentation
- [SCONE Documentation](https://sconedocs.github.io/) - SCONE framework
