# iPred Project Instructions

## iExec Deployment

- **DO NOT use Bellecour chain** - it is no longer maintained
- Use `arbitrum-sepolia-testnet` for iApp deployment (matches smart contracts)
- Chain config is set in `ipred-tee/iapp.config.json`

## Deployed iApp (Arbitrum Sepolia)

- **iApp Address**: `0x27c122b98EF9e8Ec3ea0CF1AaD1b7dbb22949F6C`
- **Explorer**: https://explorer.iex.ec/arbitrum-sepolia-testnet/app/0x27c122b98EF9e8Ec3ea0CF1AaD1b7dbb22949F6C

### Running the iApp

```bash
# Run with market ID as argument (no external storage needed - uses IEXEC_OUT)
iapp run 0x27c122b98EF9e8Ec3ea0CF1AaD1b7dbb22949F6C \
  --args "0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834" \
  --chain arbitrum-sepolia-testnet
```

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

After code changes:
```bash
cd ipred-tee
./scripts/redeploy-with-heap.sh
```
