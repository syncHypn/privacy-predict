# iExec TEE Deployment Guide

This directory contains the configuration and scripts for deploying the iPred TEE Matching Engine to iExec.

## Prerequisites

1. **iExec CLI**
   ```bash
   npm install -g iexec
   ```

2. **iExec Wallet**
   ```bash
   iexec wallet create
   ```

3. **RLC Tokens**
   - Get RLC on Bellecour network for TEE execution
   - Faucet: https://faucet.bellecour.iex.ec/

4. **Docker**
   - Docker installed and running
   - Access to Docker Hub or private registry

## Setup

### 1. Initialize iExec Project

```bash
cd iexec
iexec init --skip-wallet
```

### 2. Configure Wallet

```bash
# Import existing wallet or use created one
iexec wallet show

# Check balance
iexec wallet show --chain bellecour
```

### 3. Prepare Secrets

Create a secrets file for the TEE:

```bash
# Create secrets directory (gitignored)
mkdir -p .iexec-secrets

# Create secrets file
cat > .iexec-secrets/tee-secrets.json << EOF
{
  "teePrivateKey": "BASE64_ENCODED_PRIVATE_KEY",
  "sealedKey": "BASE64_ENCODED_SEALED_KEY"
}
EOF
```

Generate keys:
```typescript
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

const keyPair = nacl.box.keyPair();
console.log('Private Key:', encodeBase64(keyPair.secretKey));

const sealedKey = nacl.randomBytes(32);
console.log('Sealed Key:', encodeBase64(sealedKey));
```

## Build & Deploy

### 1. Build TEE Application

```bash
# From project root
cd tee
pnpm install
pnpm build
cd ..

# Build Docker image
docker build -t ipred/tee-matching-engine:latest -f iexec/Dockerfile .
```

### 2. Sconify for SGX

```bash
cd iexec
./sconify.sh
```

### 3. Push to Registry

```bash
docker push ipred/tee-matching-engine:sconified
```

### 4. Deploy Dataset (Secrets)

```bash
# Push secrets to SMS
iexec dataset push-secret .iexec-secrets/tee-secrets.json --chain bellecour

# Deploy dataset
iexec dataset deploy --chain bellecour
```

### 5. Deploy Application

```bash
# Update iexec.json with your details
# - owner: your wallet address
# - multiaddr: your Docker image address

iexec app deploy --chain bellecour
```

### 6. Publish App Order

```bash
iexec app publish --chain bellecour
```

## Configuration

### iexec.json

Key fields to update:
- `app.owner`: Your wallet address
- `app.multiaddr`: Docker Hub image path
- `app.checksum`: Image checksum (generated during deploy)
- `app.mrenclave.fingerprint`: SCONE fingerprint (generated during sconify)

### chain.json

Update `ipred.contracts` with deployed contract addresses:
- `orderQueue`: OrderQueue contract address
- `stateAnchor`: StateAnchor contract address
- `privateToken`: PrivateToken contract address
- `marketFactory`: MarketFactory contract address

## Post-Deployment

### 1. Get TEE Wallet Address

The TEE application runs with an iExec-managed wallet. Get its address:

```bash
iexec app show --chain bellecour
```

### 2. Update Smart Contracts

Set the TEE address in your deployed contracts:

```bash
# Using cast (foundry)
cast send $STATE_ANCHOR_ADDRESS "setTEEAddress(address)" $TEE_ADDRESS --rpc-url $RPC_URL --private-key $DEPLOYER_KEY

cast send $PRIVATE_TOKEN_ADDRESS "setTEEAddress(address)" $TEE_ADDRESS --rpc-url $RPC_URL --private-key $DEPLOYER_KEY
```

### 3. Verify Setup

```bash
# Check TEE is registered
cast call $STATE_ANCHOR_ADDRESS "teeAddress()" --rpc-url $RPC_URL
```

## Running the TEE

### Request Execution

```bash
# Run the TEE application
iexec app run $APP_ADDRESS \
  --chain bellecour \
  --dataset $DATASET_ADDRESS \
  --workerpool debug-v8-bellecour.main.pools.iexec.eth \
  --tag tee,scone
```

### Monitor Execution

```bash
# Check deal status
iexec deal show $DEAL_ID --chain bellecour

# Get task status
iexec task show $TASK_ID --chain bellecour
```

## Troubleshooting

### Common Issues

1. **Sconification fails**
   - Ensure Docker is running
   - Check SCONE registry access
   - Verify base image compatibility

2. **Secrets not found**
   - Push secrets before deploying dataset
   - Verify SMS connectivity

3. **TEE execution fails**
   - Check logs via iExec CLI
   - Verify contract addresses in config
   - Ensure RPC endpoints are accessible from TEE

### Debug Mode

For local testing without SGX:

```bash
# Run directly with Node
cd tee
cp .env.example .env
# Edit .env with local values
pnpm build
node dist/index.js
```

## Resources

- [iExec Documentation](https://docs.iex.ec/)
- [iExec SDK Reference](https://github.com/iExecBlockchainComputing/iexec-sdk)
- [SCONE Documentation](https://sconedocs.github.io/)
- [Bellecour Explorer](https://blockscout.bellecour.iex.ec/)
