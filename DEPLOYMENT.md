# iPred Deployment - Arbitrum Sepolia

Deployed: January 28, 2026

## Contract Addresses

| Contract | Address | Arbiscan |
|----------|---------|----------|
| **MarketFactory** | `0x2a5C3684a8dEe90D04F89212cb419b9742470d9B` | [View](https://sepolia.arbiscan.io/address/0x2a5C3684a8dEe90D04F89212cb419b9742470d9B) |
| **OrderQueue** | `0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26` | [View](https://sepolia.arbiscan.io/address/0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26) |
| **StateAnchor** | `0xA5Dc3B75157C08479f7375afD5B2b97279d711d6` | [View](https://sepolia.arbiscan.io/address/0xA5Dc3B75157C08479f7375afD5B2b97279d711d6) |
| **PrivateToken** | `0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5` | [View](https://sepolia.arbiscan.io/address/0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5) |
| **MockUSDC** | `0xA2ec86e965eE5932a282D500fFeB98D2908960C6` | [View](https://sepolia.arbiscan.io/address/0xA2ec86e965eE5932a282D500fFeB98D2908960C6) |

## Configuration

| Parameter | Value |
|-----------|-------|
| Network | Arbitrum Sepolia (Chain ID: 421614) |
| RPC URL | `https://sepolia-rollup.arbitrum.io/rpc` |
| Deployer | `0x30d5A633ab362b4bDd040BdECfefe2Ea3F29c00E` |
| Oracle | `0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38` |
| TEE Address | `0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B` |
| Collateral (MockUSDC) | `0xA2ec86e965eE5932a282D500fFeB98D2908960C6` |

## iExec TEE Application

| Parameter | Value |
|-----------|-------|
| iExec App Address | `0xa6d62839E679E0E5990B7E5EC85cf6f6c3392f08` |
| TEE Wallet | `0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B` |
| Docker Image | `romthpt/privacypredict:0.0.1` |
| RLC Token | `0x9923eD3cbd90CD78b910c475f9A731A6e0b8C963` |

---

## Verification Scripts

```bash
# MarketFactory
forge verify-contract 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  src/MarketFactory.sol:MarketFactory \
  --constructor-args $(cast abi-encode "constructor(address)" 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38) \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --etherscan-api-key $ARBISCAN_API_KEY

# OrderQueue
forge verify-contract 0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26 \
  src/OrderQueue.sol:OrderQueue \
  --constructor-args $(cast abi-encode "constructor(address)" 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B) \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --etherscan-api-key $ARBISCAN_API_KEY

# StateAnchor
forge verify-contract 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  src/StateAnchor.sol:StateAnchor \
  --constructor-args $(cast abi-encode "constructor(address)" 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38) \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --etherscan-api-key $ARBISCAN_API_KEY

# PrivateToken
forge verify-contract 0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  src/PrivateToken.sol:PrivateToken \
  --constructor-args $(cast abi-encode "constructor(address,address)" 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38) \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --etherscan-api-key $ARBISCAN_API_KEY

# MockUSDC
forge verify-contract 0xA2ec86e965eE5932a282D500fFeB98D2908960C6 \
  script/Deploy.s.sol:MockUSDC \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --etherscan-api-key $ARBISCAN_API_KEY
```

---

## Testing Scripts

### Read Operations

```bash
# Check MarketFactory oracle
cast call 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "oracle()(address)" \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check if address is whitelisted
cast call 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "whitelisted(address)(bool)" \
  0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check StateAnchor TEE address
cast call 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  "teeAddress()(address)" \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check StateAnchor state version
cast call 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  "stateVersion()(uint256)" \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check PrivateToken TEE address
cast call 0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  "teeAddress()(address)" \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check MockUSDC balance
cast call 0xA2ec86e965eE5932a282D500fFeB98D2908960C6 \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Create a Market

```bash
# Create market with 7-day resolution time
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "createMarket(string,string[],uint256)" \
  "Who will win the championship?" \
  "[\"Team A\",\"Team B\"]" \
  $(date -v+7d +%s) \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Get Market Info

```bash
# Get market by ID (replace with actual market ID from event logs)
MARKET_ID=0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880

cast call 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "getMarket(bytes32)" \
  $MARKET_ID \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Mint MockUSDC (for testing)

```bash
# Mint 1000 USDC (6 decimals)
cast send 0xA2ec86e965eE5932a282D500fFeB98D2908960C6 \
  "mint(address,uint256)" \
  YOUR_ADDRESS \
  1000000000 \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Deposit to PrivateToken

```bash
# 1. Approve USDC spending (100 USDC = 100000000)
cast send 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d \
  "approve(address,uint256)" \
  0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  100000000 \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# 2. Deposit
cast send 0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  "deposit(uint256)" \
  100000000 \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Submit Encrypted Order

```bash
# Submit order to OrderQueue
cast send 0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26 \
  "submitOrder(bytes32,bytes)" \
  $MARKET_ID \
  0x1234567890abcdef \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Commit State Root (TEE only)

```bash
# Commit a new PMT root
cast send 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  "commitRoot(bytes32,bytes)" \
  0x$(openssl rand -hex 32) \
  0x1234 \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Resolve Market (Oracle only)

```bash
# Resolve market with winning outcome (0 or 1)
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "resolveMarket(bytes32,uint8)" \
  $MARKET_ID \
  0 \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

---

## Admin Operations

### Update TEE Address

```bash
# StateAnchor
cast send 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  "setTEEAddress(address)" \
  NEW_TEE_ADDRESS \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# PrivateToken
cast send 0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  "setTEEAddress(address)" \
  NEW_TEE_ADDRESS \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Update Oracle Address

```bash
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "setOracle(address)" \
  NEW_ORACLE_ADDRESS \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Whitelist Management

```bash
# Add to whitelist
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "addToWhitelist(address)" \
  ADDRESS_TO_WHITELIST \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Remove from whitelist
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "removeFromWhitelist(address)" \
  ADDRESS_TO_REMOVE \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Pause/Unpause Contracts

```bash
# Pause MarketFactory
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "pause()" \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Unpause MarketFactory
cast send 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B \
  "unpause()" \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

---

## iExec TEE Deployment

### Prerequisites

```bash
# Install iExec CLI
npm install -g iexec

# Create wallet
cd iexec
iexec wallet create

# Get RLC from faucet
# https://faucet.bellecour.iex.ec/

# Check balance
iexec wallet show --chain bellecour
```

### Build TEE Application

```bash
# Build TypeScript
cd tee
pnpm install
pnpm build

# Build Docker image
cd ..
docker build -t ipred/tee-matching-engine:latest -f iexec/Dockerfile .
```

### Deploy to iExec

```bash
cd iexec

# Update iexec.json with your wallet address as owner

# Deploy application
iexec app deploy --chain bellecour

# Publish app order
iexec app publish --chain bellecour

# Get TEE wallet address
iexec app show --chain bellecour
```

### Update Contracts with TEE Address

After obtaining TEE address from iExec:

```bash
TEE_ADDRESS=<address-from-iexec>

# Update StateAnchor
cast send 0xA5Dc3B75157C08479f7375afD5B2b97279d711d6 \
  "setTEEAddress(address)" \
  $TEE_ADDRESS \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Update PrivateToken
cast send 0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5 \
  "setTEEAddress(address)" \
  $TEE_ADDRESS \
  --account sepolia \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

---

## Environment Variables

Create a `.env` file:

```bash
# Deployment
PRIVATE_KEY=your_private_key
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_API_KEY=your_arbiscan_api_key

# Contract Addresses
MARKET_FACTORY=0x2a5C3684a8dEe90D04F89212cb419b9742470d9B
ORDER_QUEUE=0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26
STATE_ANCHOR=0xA5Dc3B75157C08479f7375afD5B2b97279d711d6
PRIVATE_TOKEN=0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5
MOCK_USDC=0xA2ec86e965eE5932a282D500fFeB98D2908960C6
COLLATERAL_USDC=0xA2ec86e965eE5932a282D500fFeB98D2908960C6

# Roles
DEPLOYER=0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38
ORACLE=0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38
TEE_ADDRESS=0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38
```

---

## Test Market Created

| Field | Value |
|-------|-------|
| Market ID | `0x89137be6227fe319a5df0f500ce2934379a7ecd8dfaa666e6698d38284a70880` |
| Question | Who will win the 2024 election? |
| Outcomes | Candidate A, Candidate B |
| Resolution Time | Feb 4, 2026 |
| Creator | `0x30d5A633ab362b4bDd040BdECfefe2Ea3F29c00E` |
| Status | Open |
