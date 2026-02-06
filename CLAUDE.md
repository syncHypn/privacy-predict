# iPred Project Instructions

## iExec Deployment

- **DO NOT use Bellecour chain** - it is no longer maintained
- Use `arbitrum-sepolia-testnet` for iApp deployment (matches smart contracts)
- Chain config is set in `ipred-tee/iapp.config.json`

## Deployed iApp (Arbitrum Sepolia)

- **iApp Address**: `0x9e2CE74eEbD25209C9C58FadEC81fbD239d74CBa`
- **Docker Image**: `romthpt/ipred-tee:0.0.1-tee-scone-5.9.1-v16-prod-b7e4ab0b6e85`
- **Explorer**: https://explorer.iex.ec/arbitrum-sepolia-testnet/app/0x9e2CE74eEbD25209C9C58FadEC81fbD239d74CBa

### Running the iApp

**Important**: Use `market=` prefix for the market ID argument to prevent hex-to-number conversion.

```bash
# Run with market ID (use market= prefix to preserve hex string)
iapp run 0x9e2CE74eEbD25209C9C58FadEC81fbD239d74CBa \
  --args "market=0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834" \
  --chain arbitrum-sepolia-testnet
```

### Input Files

Input files must be hosted on IPFS (TEE workers cannot reach GitHub/Gist URLs).
Order of `--inputFile` arguments matters (index-based reading):
1. `deposits.json` - Credits users with cUSDC balances
2. `orders.json` - Trading orders
3. `public-state.json` - Previous public state (optional, for continuity)
4. `private-state.enc` - Previous encrypted state (optional, for continuity)

```bash
# Local test
iapp test --args "market=0x3a2b..." \
  --inputFile "https://gateway.pinata.cloud/ipfs/<deposits-CID>" \
  --inputFile "https://gateway.pinata.cloud/ipfs/<orders-CID>"

# TEE run (from iexec-builder VM)
iapp run 0x9e2CE74eEbD25209C9C58FadEC81fbD239d74CBa \
  --args "market=0x3a2b..." \
  --inputFile "https://gateway.pinata.cloud/ipfs/<deposits-CID>" \
  --inputFile "https://gateway.pinata.cloud/ipfs/<orders-CID>" \
  --chain arbitrum-sepolia-testnet
```

Input file formats:
- `deposits.json`: `[{ "user": "0x...", "amount": "500000000" }]`
- `orders.json`: `[{ "orderId": "order-001", "user": "0x...", "side": "BUY", "outcomeIndex": 0, "amount": "100000000" }]`

### Test IPFS Files (Pinata)

| File | CID |
|------|-----|
| deposits.json | QmV8pCpLF8LBAModLW7FuNpmGpkxXWSCkdJEXdPR6W6d5s |
| orders.json | QmeKTDavvttNVwG9gTWtrc7oXL6dLWBWxWxwviBYj2sf11 |

## Contract Addresses (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| PrivateToken | 0x7402c579e7a661b3fda0553e511d14bf0aadcab9 |
| MarketFactory | 0x3555b28e59e32b6d0d81de5ff123cbe73d518592 |
| OrderQueue | 0x67b830886a47bbb5f2019eb129e81f217ec56f09 |
| StateAnchor | 0x074af457ea1c58752705ce157f6892e5bbfc5988 |

## Test Markets (Arbitrum Sepolia)

| Market | ID |
|--------|-----|
| BTC 100k Market | 0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834 |
| Question? Market | 0xd84f7e3380154a1c5291b516486f371585cfccb9ffc155cfbdd5e6b5c0b4172d |

## TEE Architecture

- TEE matching engine is in `ipred-tee/src/matcher.js`
- In TEE mode, state is written to `IEXEC_OUT` directory (iExec uploads to IPFS automatically)
- External storage (Pinata/Arweave) disabled in TEE to avoid WebAssembly crashes
- Clients compute prices from public state (no on-chain price updates)

## State Output Files (in IEXEC_OUT)

- `public-state.json` - plaintext pool data (clients can read prices)
- `private-state.enc` - encrypted balances (base64)
- `state-metadata.json` - market ID, state root, version
- `result.json` - execution result with attestation

## Redeployment

Deploy from the OrbStack `iexec-builder` VM (native amd64, avoids Docker cross-platform issues on Apple Silicon):
```bash
ssh iexec-builder@orb "cd /Users/romt/Developer/iPred/ipred-tee && iapp deploy --chain arbitrum-sepolia-testnet"
```
