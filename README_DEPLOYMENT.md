# iPred Protocol - Deployment & Architecture

## Overview

iPred is a privacy-preserving prediction market protocol using TEE (Trusted Execution Environment) for confidential order processing.

```
User → Contract → Event → TEE monitors → TEE processes → TEE calls back
```

## Current Deployment (Arbitrum Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| MarketFactory | `0x3555B28E59e32b6D0d81DE5fF123cbe73d518592` | Create/resolve markets |
| OrderQueue | `0x67b830886A47BbB5f2019eb129E81F217Ec56f09` | Queue encrypted orders |
| StateAnchor | `0x074Af457Ea1C58752705ce157f6892E5bBFc5988` | Anchor TEE state roots |
| PrivateToken | `0x7402C579e7A661b3fdA0553E511D14Bf0aadcab9` | Manage encrypted balances |
| Collateral (USDC) | `0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d` | Circle USDC |
| TEE Address | `0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B` | Authorized TEE signer |
| Oracle | `0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38` | Market resolution |

**Test Market:** `0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834`

## Quick Start

### 1. Load Environment
```bash
source .env
```

### 2. Run Test Script
```bash
./test-flow.sh
```

### 3. Manual Testing
See [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) for detailed commands.

## Architecture

### Contract Roles

**MarketFactory**
- Creates prediction markets with multiple outcomes (2-10)
- Resolves markets via oracle
- Manages whitelist for market creators

**OrderQueue**
- Accepts encrypted order submissions
- Validates market exists and is open
- Emits events for TEE processing

**PrivateToken**
- Holds collateral (USDC)
- Stores encrypted balances
- Processes deposits/withdrawals via TEE

**StateAnchor**
- Stores TEE state roots on-chain
- Enables state verification

### Flow Diagrams

**Deposit Flow:**
```
User deposits USDC → PrivateToken
  → Deposit event emitted
  → TEE monitors event
  → TEE encrypts balance
  → TEE calls batchUpdateBalances()
```

**Order Flow:**
```
User submits encrypted order → OrderQueue
  → OrderSubmitted event emitted
  → TEE decrypts order
  → TEE executes trade logic
  → TEE updates balances via PrivateToken
  → TEE anchors state via StateAnchor
```

**Withdrawal Flow:**
```
User requests withdrawal → PrivateToken
  → WithdrawalRequested event emitted
  → TEE verifies balance
  → TEE calls processWithdrawal()
  → User receives USDC
```

## TEE Integration

### Events to Monitor

```solidity
// PrivateToken
event Deposit(address indexed user, uint256 amount, bytes32 commitment);
event WithdrawalRequested(address indexed user, bytes32 commitmentHash);
event WithdrawalProcessed(address indexed user, uint256 amount);
event BalancesUpdated(uint256 indexed batchId, bytes32 stateRoot);

// OrderQueue
event OrderSubmitted(
    bytes32 indexed orderId,
    bytes32 indexed marketId,
    address indexed user,
    bytes encryptedPayload,
    uint256 timestamp
);
event OrderCancelled(bytes32 indexed orderId, address indexed user);

// MarketFactory
event MarketCreated(
    bytes32 indexed marketId,
    string question,
    string[] outcomes,
    uint256 resolutionTime,
    address indexed creator
);
event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome);
```

### TEE Callbacks

```solidity
// Update encrypted balances
PrivateToken.batchUpdateBalances(
    address[] calldata users,
    bytes[] calldata newEncryptedBalances,
    bytes32 stateRoot
);

// Process withdrawal
PrivateToken.processWithdrawal(
    address user,
    uint256 amount,
    bytes calldata proof
);

// Anchor state
StateAnchor.anchorState(bytes32 stateRoot);
```

## Development

### Prerequisites
- Foundry installed
- Keystore `sepolia` configured
- USDC on Arbitrum Sepolia

### Build
```bash
forge build
```

### Test
```bash
forge test
```

### Deploy
```bash
# See DEPLOY_GUIDE.md for full instructions
forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast
```

## Files

| File | Purpose |
|------|---------|
| `.env` | Environment configuration |
| `DEPLOY_GUIDE.md` | Deployment instructions |
| `test-flow.sh` | Contract interaction tests |
| `src/MarketFactory.sol` | Market management |
| `src/OrderQueue.sol` | Order processing |
| `src/PrivateToken.sol` | Balance management |
| `src/StateAnchor.sol` | State anchoring |

## Network Info

**Arbitrum Sepolia**
- Chain ID: `421614`
- Explorer: https://sepolia.arbiscan.io

## Next Steps

1. Implement TEE event monitoring service
2. Build TEE order processing logic
3. Implement encryption/decryption with TEE keys
4. End-to-end integration testing
5. Deploy to mainnet
