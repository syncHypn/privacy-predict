# iPred: Next Steps

This document outlines the next implementation steps for the iPred Confidential Prediction Market protocol.

---

## Current State (Completed)

### Core TEE Components
- [x] **EncryptionManager** - NaCl encryption (XSalsa20-Poly1305) for balances and orders
- [x] **StateManager** - Manages encrypted balances and pool reserves
- [x] **ConfidentialAMM** - Constant product AMM with confidential reserves
- [x] **OrderMatcher** - Processes buy/sell/redeem orders with slippage protection
- [x] **ArweaveStorage** - Permanent state storage with split state support
- [x] **PriceClient** - Client-side price computation from Arweave

### Split State Architecture
- [x] Public state (plaintext pools) saved to Arweave
- [x] Private state (encrypted balances) saved to Arweave
- [x] Clients fetch prices from Arweave (no on-chain price updates)
- [x] TEE can recover full state from Arweave
- [x] ArLocal support for local testing

### Smart Contracts (Deployed on Arbitrum Sepolia)
- [x] **MarketFactory** - Market creation and resolution
- [x] **OrderQueue** - Encrypted order submission
- [x] **StateAnchor** - On-chain state root commits
- [x] **PrivateToken** - Encrypted balance management

---

## Phase 1: TEE Integration (Priority: High)

### 1.1 iExec iApp Development

**Goal**: Convert iPred TEE logic into a deployable iExec iApp

#### Step 1: Initialize iApp Project

```bash
# Install iExec CLI
npm install -g @iexec/iapp

# Initialize project (in ipred-tee directory)
cd ipred-tee
iapp init
# Select: JavaScript, Advanced mode
```

#### Step 2: Project Structure

```
ipred-tee/
  src/
    app.js              # Main iApp entry point (NEW)
    encryption.js       # Existing
    stateManager.js     # Existing
    orderMatcher.js     # Existing
    arweaveStorage.js   # Existing
    priceClient.js      # Existing
  Dockerfile            # For SCONE TEE image
  iapp.config.json      # iExec configuration
  sconify.sh            # TEE image build script
```

#### Step 3: Create iApp Entry Point (`src/app.js`)

```javascript
const fs = require('fs');
const path = require('path');

// iExec environment variables
const IEXEC_IN = process.env.IEXEC_IN;
const IEXEC_OUT = process.env.IEXEC_OUT;

// Requester secrets (configured in iExec)
const ARWEAVE_WALLET = process.env.IEXEC_REQUESTER_SECRET_1;
const SEALED_KEY = process.env.IEXEC_APP_DEVELOPER_SECRET; // App secret

// Import iPred modules
const { EncryptionManager } = require('./encryption.js');
const { StateManager } = require('./stateManager.js');
const { OrderMatcher } = require('./orderMatcher.js');
const { ArweaveStorage } = require('./arweaveStorage.js');

async function main() {
  try {
    // 1. Read input (orders batch from IEXEC_IN)
    const inputPath = path.join(IEXEC_IN, 'orders.json');
    const orders = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // 2. Initialize components with secrets
    const encryption = new EncryptionManager(Buffer.from(SEALED_KEY, 'hex'));
    const arweave = new ArweaveStorage(JSON.parse(ARWEAVE_WALLET));
    const state = new StateManager(encryption);
    const matcher = new OrderMatcher(state, encryption, arweave);

    // 3. Load previous state from Arweave
    await matcher.loadState();

    // 4. Process orders
    const result = await matcher.processBatch(orders);

    // 5. Save state to Arweave
    await matcher.saveState();

    // 6. Write output
    const outputPath = path.join(IEXEC_OUT, 'result.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      fills: result.fills,
      stateRoot: result.stateRoot,
      callbackData: result.callbackData, // For on-chain callback
    }));

    // 7. Write computed.json (REQUIRED by iExec)
    const computedPath = path.join(IEXEC_OUT, 'computed.json');
    fs.writeFileSync(computedPath, JSON.stringify({
      'deterministic-output-path': outputPath,
    }));

    console.log('iApp execution completed successfully');
  } catch (error) {
    console.error('iApp error:', error);
    process.exit(1);
  }
}

main();
```

#### Step 4: Create Dockerfile

```dockerfile
FROM node:22-alpine3.21

# Install dependencies
RUN mkdir /app
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src/ ./src/

ENTRYPOINT ["node", "/app/src/app.js"]
```

#### Step 5: Build Non-TEE Image

```bash
# Build and tag
docker build -t <dockerhub-user>/ipred-tee:0.1.0 .

# Test locally
docker run --rm \
  -e IEXEC_IN=/tmp/in \
  -e IEXEC_OUT=/tmp/out \
  -e IEXEC_REQUESTER_SECRET_1='{"kty":"RSA",...}' \
  -e IEXEC_APP_DEVELOPER_SECRET='<sealed-key-hex>' \
  -v $(pwd)/test-input:/tmp/in \
  -v $(pwd)/test-output:/tmp/out \
  <dockerhub-user>/ipred-tee:0.1.0

# Push to DockerHub
docker push <dockerhub-user>/ipred-tee:0.1.0
```

#### Step 6: Build SCONE TEE Image

```bash
# Generate enclave signing key (one-time)
openssl genrsa -3 -out enclave-key.pem 3072

# Create sconify.sh script
cat > sconify.sh << 'EOF'
#!/bin/bash
IMG_FROM=<dockerhub-user>/ipred-tee:0.1.0
IMG_TO=<dockerhub-user>/ipred-tee:0.1.0-tee-scone-5.9.1-v16

docker run -it --rm \
  -v $PWD/enclave-key.pem:/sig/enclave-key.pem \
  -v /var/run/docker.sock:/var/run/docker.sock \
  registry.scontain.com/scone-production/iexec-sconify-image:5.9.1-v16 \
  sconify_iexec \
  --from=${IMG_FROM} \
  --to=${IMG_TO} \
  --binary-fs \
  --fs-dir=/app \
  --host-path=/etc/hosts \
  --host-path=/etc/resolv.conf \
  --binary=/usr/local/bin/node \
  --heap=1G \
  --dlopen=1 \
  --verbose

echo "TEE image built: ${IMG_TO}"
echo "mrenclave fingerprint: $(docker run --rm -e SCONE_HASH=1 ${IMG_TO})"
EOF

chmod +x sconify.sh
./sconify.sh

# Push TEE image
docker push <dockerhub-user>/ipred-tee:0.1.0-tee-scone-5.9.1-v16
```

#### Step 7: Deploy iApp to iExec

```bash
# Initialize iExec app config
iexec app init --tee

# Edit iexec.json with your values
cat > iexec.json << 'EOF'
{
  "app": {
    "owner": "0xYourWalletAddress",
    "name": "ipred-tee",
    "type": "DOCKER",
    "multiaddr": "docker.io/<dockerhub-user>/ipred-tee:0.1.0-tee-scone-5.9.1-v16",
    "checksum": "0x<image-digest>",
    "mrenclave": {
      "framework": "SCONE",
      "version": "v5.9",
      "entrypoint": "node /app/src/app.js",
      "heapSize": 1073741824,
      "fingerprint": "<mrenclave-from-sconify>"
    }
  }
}
EOF

# Deploy app
iexec app deploy --chain bellecour

# Push app secret (sealed key)
iexec app push-secret --chain bellecour
```

#### Step 8: Run iApp

```bash
# Run with TEE tag
iexec app run \
  --chain bellecour \
  --tag tee,scone \
  --workerpool debug-v8-bellecour.main.pools.iexec.eth \
  --watch
```

### 1.2 Secrets Configuration

**iExec Secrets for iPred:**

| Secret | Type | Description |
|--------|------|-------------|
| `IEXEC_APP_DEVELOPER_SECRET` | App Secret | Sealed encryption key (set by app owner) |
| `IEXEC_REQUESTER_SECRET_1` | Requester Secret | Arweave wallet JSON |
| `IEXEC_REQUESTER_SECRET_2` | Requester Secret | RPC URL for callbacks (optional) |

```bash
# Push app secret (done once by app owner)
iexec app push-secret \
  --secret-value "<sealed-key-hex>" \
  --chain bellecour

# Requester provides secrets when running
iexec app run \
  --secret 1=<arweave-wallet-json> \
  --secret 2=<rpc-url> \
  --chain bellecour
```

### 1.3 Orchestrator Implementation

**Goal**: Bridge between on-chain events and TEE execution

**Tasks**:
- [ ] Event listener for OrderQueue events
- [ ] Batch collection with configurable timing
- [ ] TEE task triggering via iExec SDK
- [ ] Callback submission to contracts

**Orchestrator Flow:**

```javascript
// orchestrator.js (runs outside TEE)
import { IExec } from 'iexec';
import { ethers } from 'ethers';

async function orchestratorLoop() {
  const iexec = new IExec({ ethProvider: window.ethereum });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const orderQueue = new ethers.Contract(ORDER_QUEUE_ADDRESS, ABI, provider);

  while (true) {
    // 1. Collect pending orders
    const orders = await collectPendingOrders(orderQueue);

    if (orders.length > 0) {
      // 2. Package orders as input file
      const inputCid = await uploadToIPFS(orders);

      // 3. Trigger TEE execution
      const dealid = await iexec.order.matchOrders({
        apporder: await iexec.order.fetchAppOrderbook(APP_ADDRESS),
        datasetorder: inputCid,
        workerpoolorder: await iexec.order.fetchWorkerpoolOrderbook(),
        requestorder: await iexec.order.createRequestorder({
          app: APP_ADDRESS,
          tag: ['tee', 'scone'],
          args: '--batch',
        }),
      });

      // 4. Wait for result
      const result = await iexec.task.waitForTaskResult(dealid);

      // 5. Submit callback to contracts
      await submitCallback(result.callbackData);
    }

    await sleep(BATCH_INTERVAL);
  }
}
```

### 1.4 Arweave Mainnet Setup

**Goal**: Production Arweave wallet and funding

**Tasks**:
- [ ] Generate production Arweave wallet
- [ ] Fund wallet with AR tokens (~0.1 AR for testing)
- [ ] Test upload/download on mainnet
- [ ] Configure wallet as iExec requester secret

```bash
# Generate wallet
node -e "
const Arweave = require('arweave');
const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
arweave.wallets.generate().then(w => console.log(JSON.stringify(w)));
" > arweave-wallet.json

# Get address
node -e "
const Arweave = require('arweave');
const wallet = require('./arweave-wallet.json');
const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
arweave.wallets.jwkToAddress(wallet).then(a => console.log('Address:', a));
"

# Fund wallet at https://faucet.arweave.net or buy AR
```

---

## Phase 2: Contract Integration (Priority: High)

### 2.1 PrivateToken Integration

**Goal**: Connect TEE balance updates to on-chain contract

**Tasks**:
- [ ] Implement `batchUpdateBalances` callback encoding
- [ ] Add TEE signature verification in contract
- [ ] Test deposit -> balance update flow
- [ ] Test withdrawal flow

**Files to modify**:
- `ipred-tee/src/matcher.js` - Add callback encoding
- `src/PrivateToken.sol` - Verify TEE signatures

### 2.2 Order Flow Implementation

**Goal**: Full order lifecycle from submission to execution

**Tasks**:
- [ ] Client-side order encryption (NaCl box)
- [ ] OrderQueue submission
- [ ] TEE order decryption and processing
- [ ] Balance update callbacks

**New files**:
- `ipred-tee/src/orderDecryption.js` - Decrypt user orders in TEE
- `sdk/orderEncryption.ts` - Client-side order encryption

### 2.3 Market Resolution

**Goal**: Oracle-triggered market settlement

**Tasks**:
- [ ] Oracle integration for resolution trigger
- [ ] Settlement logic in TEE
- [ ] Winner payout calculation
- [ ] Final balance updates

---

## Phase 3: Client SDK (Priority: Medium)

### 3.1 Price Client Package

**Goal**: Standalone npm package for price fetching

**Tasks**:
- [ ] Extract PriceClient to separate package
- [ ] Add TypeScript types
- [ ] Publish to npm as `@ipred/price-client`
- [ ] Documentation and examples

**Package structure**:
```
@ipred/price-client/
  src/
    index.ts
    priceClient.ts
    types.ts
  package.json
  README.md
```

### 3.2 Order SDK

**Goal**: Client library for order submission

**Tasks**:
- [ ] Order encryption utilities
- [ ] Contract interaction helpers
- [ ] Balance decryption (viewing key)
- [ ] TypeScript support

**Package structure**:
```
@ipred/sdk/
  src/
    index.ts
    encryption.ts
    contracts.ts
    types.ts
  package.json
```

---

## Phase 4: Frontend (Priority: Medium)

### 4.1 Basic UI

**Goal**: Simple React interface for testing

**Tasks**:
- [ ] Wallet connection (wagmi/viem)
- [ ] Market listing page
- [ ] Order form (buy/sell)
- [ ] Position display
- [ ] Price chart (from Arweave history)

### 4.2 Advanced Features

**Tasks**:
- [ ] Order history
- [ ] Portfolio view
- [ ] Market creation form
- [ ] Resolution status

---

## Phase 5: Production Hardening (Priority: Low)

### 5.1 Security

- [ ] Smart contract audit
- [ ] TEE security review
- [ ] Penetration testing
- [ ] Bug bounty program

### 5.2 Monitoring

- [ ] TEE health monitoring
- [ ] Arweave sync status
- [ ] Order processing metrics
- [ ] Alert system

### 5.3 Redundancy

- [ ] Multiple TEE instances
- [ ] Failover mechanisms
- [ ] State backup strategies

---

## Testing Checklist

### Unit Tests
- [x] EncryptionManager tests
- [x] StateManager tests
- [x] ConfidentialAMM tests
- [x] OrderMatcher tests
- [x] ArweaveStorage tests
- [x] PriceClient tests
- [x] Split state tests

### Integration Tests
- [x] E2E split state flow (mock)
- [x] ArLocal integration test
- [ ] Contract integration tests
- [ ] Full order flow tests

### Production Tests
- [ ] Arweave mainnet upload/download
- [ ] iExec TEE execution
- [ ] End-to-end with real contracts

---

## Quick Start Commands

```bash
# Run unit tests
cd ipred-tee && npm test

# Run E2E tests (mock Arweave)
node ipred-tee/test/test-split-state-e2e.js

# Run ArLocal integration test
node ipred-tee/scripts/test-arweave-arlocal.js

# Run Arweave mainnet test (requires funded wallet)
ARWEAVE_WALLET='{"kty":"RSA",...}' node ipred-tee/scripts/test-arweave-split-state.js
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User                                       │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Arbitrum Sepolia                          │    │
│  │  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐  │    │
│  │  │PrivateToken  │  │ OrderQueue  │  │  MarketFactory     │  │    │
│  │  │              │  │             │  │                    │  │    │
│  │  │- deposit()   │  │- submit()   │  │- createMarket()    │  │    │
│  │  │- withdraw()  │  │- cancel()   │  │- resolveMarket()   │  │    │
│  │  └──────────────┘  └─────────────┘  └────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│                             │ Events                                 │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Orchestrator                            │    │
│  │  - Listen to events                                          │    │
│  │  - Batch orders                                              │    │
│  │  - Trigger TEE                                               │    │
│  │  - Submit callbacks                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    iExec TEE (SCONE)                         │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  Confidential Processing                              │   │    │
│  │  │  - Decrypt orders                                     │   │    │
│  │  │  - Execute AMM swaps                                  │   │    │
│  │  │  - Update encrypted balances                          │   │    │
│  │  │  - Save split state to Arweave                        │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        Arweave                               │    │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │ PUBLIC STATE        │  │ PRIVATE STATE               │   │    │
│  │  │ (plaintext pools)   │  │ (encrypted balances)        │   │    │
│  │  └─────────────────────┘  └─────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      PriceClient                             │    │
│  │  - Fetch public state from Arweave                          │    │
│  │  - Compute indicative prices                                │    │
│  │  - Cache results                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contact

For questions or contributions, see the main repository README.
