# iPred Project Instructions

## iExec Deployment

- **DO NOT use Bellecour chain** - it is no longer maintained
- Use `arbitrum-sepolia-testnet` for iApp deployment (matches smart contracts)
- Chain config is set in `ipred-tee/iapp.config.json`

## Deployed iApp (Arbitrum Sepolia)

- **iApp Address**: `0xd4723852f4064CB103CF4CC04C45474AB8BD9dB6`
- **Docker Image**: `romthpt/ipred-tee:0.0.1-tee-scone-5.9.1-v16-prod-3d2b6dd1734b`
- **Explorer**: https://explorer.iex.ec/arbitrum-sepolia-testnet/app/0xd4723852f4064CB103CF4CC04C45474AB8BD9dB6

### Running the iApp

**Important**: Use `market=` prefix for the market ID argument to prevent hex-to-number conversion.

```bash
# Run with market ID (use market= prefix to preserve hex string)
iapp run 0xd4723852f4064CB103CF4CC04C45474AB8BD9dB6 \
  --args "market=0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834" \
  --chain arbitrum-sepolia-testnet
```

### Testing with Input Files

Sample input files are in `ipred-tee/input/`. Upload to a public URL (GitHub Gist, IPFS) then:

```bash
iapp test --args "market=0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834" \
  --inputFile "https://your-url/deposits.json" \
  --inputFile "https://your-url/orders.json"
```

Input file formats:
- `deposits.json` - Credits users with cUSDC balances: `[{ "user": "0x...", "amount": "500000000" }]`
- `orders.json` - Trading orders: `[{ "orderId": "order-001", "user": "0x...", "side": "BUY", "outcomeIndex": 0, "amount": "100000000" }]`
- `public-state.json` / `private-state.enc` - Previous state for continuity between runs

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
