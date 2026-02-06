# Arweave Wallet Guide for iPred TEE

This guide covers wallet setup and management for iPred's Arweave integration, which stores TEE state permanently on the Arweave network.

## Overview

iPred uses Arweave for:
- **Public State**: Plaintext AMM pool reserves (clients read for price computation)
- **Private State**: Encrypted user balances (only TEE can decrypt)
- **Audit Trail**: Batch results and state roots for verification

The wallet format is **JWK (JSON Web Key)** - an RSA key pair stored as JSON.

---

## Wallet Setup

### Option 1: Generate via arweave-js (Recommended for Development)

```bash
cd ipred-tee

# Generate a new wallet
node -e "
const Arweave = require('arweave');
const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
arweave.wallets.generate().then(wallet => {
  console.log(JSON.stringify(wallet, null, 2));
}).catch(console.error);
" > wallet.json
```

Or use the built-in helper:

```javascript
import { generateWallet } from './src/arweaveStorage.js';

const wallet = await generateWallet();
console.log(JSON.stringify(wallet, null, 2));
```

### Option 2: Generate via ArDrive CLI (Seedphrase Backup)

```bash
# Install ArDrive CLI
npm install -g ardrive-cli

# Generate seedphrase (SAVE THIS SECURELY)
ardrive generate-seedphrase

# Generate wallet from seedphrase
ardrive generate-wallet -s "your twelve word seedphrase goes here" > wallet.json
```

**Advantage**: You can recover the wallet from the seedphrase if the keyfile is lost.

### Option 3: Use ArConnect Browser Extension (For Manual Testing)

1. Install [ArConnect](https://arconnect.io) browser extension
2. Create or import a wallet
3. Export keyfile: Settings > Export Keyfile

---

## Wallet File Structure

The wallet is a JWK (JSON Web Key) with RSA-4096:

```json
{
  "kty": "RSA",
  "e": "AQAB",
  "n": "<public modulus>",
  "d": "<private exponent>",
  "p": "<first prime>",
  "q": "<second prime>",
  "dp": "<d mod (p-1)>",
  "dq": "<d mod (q-1)>",
  "qi": "<q^-1 mod p>"
}
```

**Never share the private components** (`d`, `p`, `q`, `dp`, `dq`, `qi`).

---

## Configuration

### Environment Variable

Set `ARWEAVE_WALLET` with the full JSON content (minified):

```bash
# Development (.env file)
ARWEAVE_WALLET='{"kty":"RSA","e":"AQAB","n":"...","d":"...","p":"...","q":"...","dp":"...","dq":"...","qi":"..."}'
```

### iExec Secrets (Production)

For TEE deployment, store the wallet in iExec secrets:

```bash
# Push wallet as secret
iexec secret push --secret-name arweave-wallet --secret-value "$(cat wallet.json | jq -c .)"

# Verify secret is set
iexec secret check --secret-name arweave-wallet
```

The TEE app reads it from the secrets environment.

---

## Funding the Wallet

Arweave transactions require AR tokens. Costs are based on data size:

| Data Size | Approximate Cost |
|-----------|------------------|
| 1 KB      | ~0.0000001 AR    |
| 100 KB    | ~0.00001 AR      |
| 1 MB      | ~0.0001 AR       |

### Get Wallet Address

```javascript
import Arweave from 'arweave';

const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
const wallet = JSON.parse(process.env.ARWEAVE_WALLET);
const address = await arweave.wallets.jwkToAddress(wallet);
console.log('Address:', address);
```

Or via CLI:

```bash
node -e "
const Arweave = require('arweave');
const wallet = JSON.parse(process.env.ARWEAVE_WALLET);
Arweave.init({}).wallets.jwkToAddress(wallet).then(console.log);
"
```

### Fund the Wallet

1. **Faucet (Testnet)**: Not available for mainnet
2. **Exchange**: Buy AR on exchanges (Binance, KuCoin, etc.)
3. **ArDrive Credits**: Purchase Turbo credits at [ardrive.io](https://ardrive.io)

### Check Balance

```javascript
const balance = await arweave.wallets.getBalance(address);
const ar = arweave.ar.winstonToAr(balance);
console.log('Balance:', ar, 'AR');
```

---

## Security Best Practices

### DO

- Store wallet JSON in environment variables or secrets management
- Use iExec secrets for production TEE deployments
- Keep seedphrase backup in cold storage (if using ArDrive method)
- Use separate wallets for development/production
- Monitor wallet balance to ensure sufficient funds

### DON'T

- Commit wallet files to git
- Share private key components
- Store wallet in plaintext files on production servers
- Use the same wallet across multiple environments

### Gitignore Entry

Add to `.gitignore`:

```
wallet.json
*.jwk
arweave-key*.json
```

---

## Usage in iPred

### Initialize Storage

```javascript
import { createArweaveStorage, ArweaveStorage } from './src/arweaveStorage.js';

// From environment (production)
const storage = createArweaveStorage();

// Or manually
const wallet = JSON.parse(process.env.ARWEAVE_WALLET);
const storage = new ArweaveStorage(wallet);
```

### Check Wallet Status

```javascript
const address = await storage.getAddress();
const balance = await storage.getBalance();
console.log(`Wallet: ${address}`);
console.log(`Balance: ${balance} AR`);
```

### Upload Split State

```javascript
// Public state (plaintext pools for clients)
const publicState = {
  pools: {
    'market-123': {
      reserveUSDC: '1000000000000',
      reserveYES: '500000000000',
      reserveNO: '500000000000',
    }
  },
  version: 1,
  timestamp: Date.now(),
};

// Private state (encrypted balances - already encrypted by TEE)
const encryptedPrivateState = await encryptState(privateState, sealedKey);

// Upload both
const { publicTxId, privateTxId, stateRoot } = await storage.uploadSplitState(
  publicState,
  encryptedPrivateState,
  { 'Market-Id': 'market-123' }
);

console.log('Public TX:', publicTxId);
console.log('Private TX:', privateTxId);
```

### Query Latest State

```javascript
// Find latest public state (clients use this)
const publicInfo = await storage.findLatestPublicState('market-123');
if (publicInfo) {
  const publicState = await storage.downloadPublicState(publicInfo.txId);
  console.log('Pool reserves:', publicState.pools);
}

// Find corresponding private state (TEE uses this)
const privateTxId = await storage.findPrivateStateForPublic(publicInfo.txId);
const encryptedState = await storage.downloadState(privateTxId);
```

---

## Cost Optimization

iPred uses delta compression to minimize storage costs:

1. **Checkpoints**: Full state snapshots every 10 batches
2. **Deltas**: Only changes between batches (when < 70% of full size)
3. **Split State**: Public pools separate from private balances

### Monitoring Costs

```javascript
// Track upload sizes
const result = await storage.uploadStateWithDelta(
  encryptedState,
  plainState,
  previousState,
  { 'Market-Id': 'market-123' }
);

console.log('Upload type:', result.type); // 'checkpoint', 'delta', or 'full'
if (result.operationCount) {
  console.log('Delta operations:', result.operationCount);
}
```

---

## Troubleshooting

### "ARWEAVE_WALLET environment variable required"

Ensure the wallet JSON is set:

```bash
export ARWEAVE_WALLET='{"kty":"RSA",...}'
```

### "Insufficient funds"

Check balance and fund the wallet:

```javascript
const balance = await storage.getBalance();
if (parseFloat(balance) < 0.001) {
  console.error('Low balance:', balance, 'AR');
}
```

### Transaction Pending

Arweave transactions take 2-10 minutes to confirm:

```javascript
const status = await storage.getTransactionStatus(txId);
console.log('Confirmations:', status.confirmed?.number_of_confirmations || 0);
```

### GraphQL Query Fails

The Arweave gateway may be slow. Retry with backoff:

```javascript
async function retryQuery(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

---

## Quick Reference

| Task | Command/Code |
|------|--------------|
| Generate wallet | `arweave.wallets.generate()` |
| Get address | `arweave.wallets.jwkToAddress(wallet)` |
| Check balance | `arweave.wallets.getBalance(address)` |
| Upload state | `storage.uploadSplitState(public, private, meta)` |
| Find latest | `storage.findLatestPublicState(marketId)` |
| Download state | `storage.downloadState(txId)` |

---

## Related Files

- [arweaveStorage.js](../ipred-tee/src/arweaveStorage.js) - Storage implementation
- [config.js](../ipred-tee/src/config.js) - Arweave network configuration
- [SPEC.md](./SPEC.md) - Architecture overview
