# iPred - Confidential Prediction Market

A privacy-preserving prediction market protocol where all balances are encrypted on-chain and order matching happens inside a Trusted Execution Environment (TEE). Users trade prediction outcomes without exposing position sizes, order flow, or balances to anyone -- including validators and protocol operators.

## Problem

Existing prediction markets (Polymarket, Augur) expose critical information:

- **Order flow** -- front-runners see and exploit pending bets
- **Position sizes** -- competitors see your exposure and trade against you
- **Whale activity** -- large bets move markets before execution

iPred solves this by encrypting all balances on-chain and processing orders inside an iExec TEE enclave. The encryption key never leaves the TEE -- not even protocol operators can see user balances.

## How It Works

1. **Deposit** -- Users deposit USDC, which gets converted to **cUSDC** (Confidential USDC) with encrypted balances
2. **Trade** -- Orders are encrypted client-side and submitted to an on-chain queue. The TEE decrypts them, runs a constant-product AMM (x * y = k, 0.3% fee), and produces updated encrypted balances
3. **Settle** -- The TEE commits a Merkle state root on-chain via iExec callback. Prices are derived from public pool reserves published to IPFS
4. **Withdraw** -- Users request withdrawal; the TEE validates the encrypted balance and releases USDC

For each market, two confidential outcome tokens are created: **cYES** and **cNO**, priced so that P(YES) + P(NO) = 1.

All balances use NaCl symmetric encryption (XSalsa20-Poly1305). Orders use NaCl asymmetric encryption (X25519 + XSalsa20-Poly1305). The sealed key never leaves the TEE enclave.

## Architecture

```
                          +---------------------+
                          |   Frontend (Next.js) |
                          |   Privy auth, wagmi  |
                          +---------+-----------+
                                    |
                     encrypts orders with TEE pubkey
                                    |
                                    v
              +---------------------------------------------+
              |        Smart Contracts (Arbitrum Sepolia)    |
              |                                             |
              |  MarketFactory    - create/resolve markets  |
              |  OrderQueue       - encrypted order queue   |
              |  PrivateToken     - deposits & withdrawals  |
              |  StateAnchor      - Merkle state roots      |
              |  CallbackReceiver - iExec callback relay    |
              +---------------------+-----------------------+
                                    |
                    events (deposits, orders, withdrawals)
                                    |
                                    v
              +---------------------------------------------+
              |           iExec TEE iApp (SCONE)            |
              |                                             |
              |  1. Replay chain events (deposits, orders)  |
              |  2. Decrypt with sealed key                 |
              |  3. Run constant-product AMM                |
              |  4. Re-encrypt balances                     |
              |  5. Commit state root via callback          |
              |  6. Publish pool reserves to IPFS           |
              +---------------------------------------------+
                                    |
              callback (state root + prices) -----> on-chain
              public state (pool reserves)  -----> IPFS
```

### Two-Phase Callback

The iExec PoCo hub has a 200k gas limit for callbacks. iPred handles this with a two-phase approach:

1. **Phase 1** -- `CallbackReceiver.receiveResult()` commits the state root and prices (fits in 200k gas)
2. **Phase 2** -- Owner calls `applyBalanceUpdate()` and `applyWithdrawals()` separately with full data from TEE output files

### Stateless TEE with Chain Replay

The iApp does not persist state between runs. Each execution replays the full event history from the chain (deposits, orders, withdrawals), ensuring determinism and preventing out-of-sync issues. Previous encrypted state can optionally be loaded from IPFS for continuity.

## Project Structure

```
contracts/                  Solidity smart contracts (Foundry)
  src/
    MarketFactory.sol         Market creation (2-10 outcomes) and oracle resolution
    OrderQueue.sol            Encrypted order submission and cancellation
    PrivateToken.sol          Encrypted balance management, USDC deposits/withdrawals
    StateAnchor.sol           On-chain Merkle Patricia Trie state root anchoring
    IExecCallbackReceiver.sol iExec callback handler (two-phase state updates)
    ConfidentialERC20.sol     Base confidential ERC20 (cUSDC, cYES, cNO)
    interfaces/               Contract interfaces
    libraries/                MerklePatriciaProof verification
  test/                     Foundry tests
  script/                   Deployment scripts (Forge)

ipred-tee/                  iExec TEE application (Node.js)
  src/
    app.js                    Entry point -- orchestrates deposits, orders, withdrawals
    amm.js                    Constant-product AMM with P(YES)+P(NO)=1 constraint
    stateManager.js           Pool reserves and encrypted balance tracking
    encryption.js             NaCl sealed key encryption (secretbox + box)
    chainReader.js            Reads on-chain events (ethers.js v6)
    chainWriter.js            Generates ABI-encoded callback data

frontend/                   Next.js web application
  src/
    app/                      App Router pages (home, markets, portfolio, admin)
    components/               Trading panel, market grid, deposit/withdraw modals
    lib/                      Hooks (useMarkets, useSubmitOrder), services, ABIs
    store/                    Zustand state (modals, search, filters)
  config/                   Contract addresses and ABIs

goldsky/                    Event indexer configuration (Goldsky + Neon Postgres)
docs/                       Specification, architecture, encryption docs
```

## Smart Contracts

| Contract | Description |
|----------|-------------|
| **MarketFactory** | Creates prediction markets with 2-10 categorical outcomes, oracle-based resolution |
| **OrderQueue** | Accepts encrypted order submissions, emits events for TEE consumption |
| **PrivateToken** | Manages encrypted balances, handles USDC deposits and withdrawal requests |
| **StateAnchor** | Anchors Merkle Patricia Trie roots committed by the TEE after each batch |
| **CallbackReceiver** | Receives iExec PoCo hub callbacks, forwards state roots and balance updates |
| **ConfidentialERC20** | Base encrypted ERC20 with TEE-gated balance updates (cUSDC, cYES, cNO) |

## Privacy Model

| Data | Visibility | Rationale |
|------|------------|-----------|
| User balances (cUSDC, cYES, cNO) | TEE only (encrypted on-chain) | Core privacy guarantee |
| Order amounts and sides | TEE only (encrypted before submission) | Prevents front-running and MEV |
| Position sizes | User only (via viewing key) | Prevents position hunting |
| Pool reserves and prices | Public (published to IPFS) | Required for price discovery UX |
| Market questions and outcomes | Public | Users need to know what they are trading |
| Resolution results | Public | Verifiable fairness |

## Tech Stack

- **Contracts**: Solidity 0.8.24, Foundry, OpenZeppelin v5
- **TEE**: iExec SCONE runtime, Node.js 20+, ethers.js v6, TweetNaCl
- **Frontend**: Next.js 16, React 19, TypeScript, wagmi/viem, Privy auth, TailwindCSS 4, shadcn/ui, Zustand
- **Indexing**: Goldsky subgraph + Neon serverless Postgres
- **Chain**: Arbitrum Sepolia testnet
- **Storage**: IPFS (Pinata) for TEE input/output files, on-chain Merkle state roots

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 20+
- [iExec CLI](https://docs.iex.ec/) (`npm i -g iexec` + `npm i -g @iexec/iapp`)

### Build and Test Contracts

```bash
cd contracts
forge build
forge test
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### TEE Local Test

```bash
cd ipred-tee
npm install
iapp test --args "market=0x3a2b..." \
  --inputFile "https://gateway.pinata.cloud/ipfs/<deposits-CID>" \
  --inputFile "https://gateway.pinata.cloud/ipfs/<orders-CID>"
```

Input files must be hosted on IPFS (TEE workers cannot reach GitHub/Gist URLs). The order of `--inputFile` arguments matters:

1. `deposits.json` -- user deposit credits
2. `orders.json` -- trading orders
3. `public-state.json` -- previous public state (optional)
4. `private-state.enc` -- previous encrypted state (optional)
5. `withdrawals.json` -- withdrawal requests (optional)

## Deployed Contracts (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| MarketFactory | `0x3555b28e59e32b6d0d81de5ff123cbe73d518592` |
| OrderQueue | `0x67b830886a47bbb5f2019eb129e81f217ec56f09` |
| PrivateToken | `0x7402c579e7a661b3fda0553e511d14bf0aadcab9` |
| StateAnchor | `0x074af457ea1c58752705ce157f6892e5bbfc5988` |
| CallbackReceiver | `0xBD830E10aD1A1cb6054da7A3B52BAFb93Bd0f4c1` |
| iApp (TEE) | `0x16a15349b32999703e9394C787B0C857F7342790` |

## License

MIT
