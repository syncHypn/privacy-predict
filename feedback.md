# iPred - Hackathon Feedback

## What We Built

iPred is a **confidential prediction market protocol** where all user balances and positions are encrypted on-chain using NaCl cryptography. An iExec TEE (Trusted Execution Environment) handles decryption, order matching, and re-encryption -- so no one (not even the contract owner) can see individual positions or front-run trades.

## What Went Well

- **End-to-end TEE integration**: The iExec iApp successfully runs inside a SCONE enclave, processes encrypted state, and triggers an on-chain callback via the PoCo hub. This was the hardest part and it works reliably.
- **On-chain callback flow**: The two-phase design (lightweight `commitRoot` in the 200k gas callback, then separate `applyBalanceUpdate` / `applyWithdrawals` calls) was a clean solution to the gas limit constraint.
- **Smart contract architecture**: Five contracts with clear separation of concerns -- PrivateToken for encrypted balances, StateAnchor for Merkle roots, OrderQueue for on-chain order submission, MarketFactory for market creation, and CallbackReceiver as the bridge between iExec and our contracts.
- **Frontend UX**: The Next.js frontend with Privy wallet integration provides a smooth trading experience with deposit/withdraw flows, order placement, portfolio tracking, and real-time price charts derived from public state.

## Challenges and Lessons Learned

- **Docker cross-platform builds on Apple Silicon**: The `iapp` CLI uses `dockerode` (Docker Engine API) directly, not Docker CLI / BuildKit. OrbStack's legacy `/build` endpoint fails for `linux/amd64` intermediate layers on ARM. We had to deploy from a native amd64 VM.
- **iExec hex argument parsing**: iExec parses bare hex strings (`0x...`) as JavaScript numbers, causing scientific notation conversion. We solved this with a `market=` prefix convention.
- **TEE file access limitations**: TEE workers cannot reach GitHub/Gist URLs. All input files must be hosted on IPFS. Additionally, the TEE names files by their last URL segment (the IPFS CID), so we had to switch to index-based file reading.
- **Callback storage trade-off**: When using the iExec callback storage mode, the TEE result archive is not downloadable from IPFS. We had to design the system so the callback carries all necessary data (state root, match ID, attestation) and the detailed balance updates are applied separately.

## What We Would Improve

- **Decentralized relayer**: Currently the owner calls `applyBalanceUpdate()` and `applyWithdrawals()` manually. A keeper network or automated relayer would remove this centralization point.
- **Multi-outcome markets**: The current MVP supports binary YES/NO markets only. Extending to categorical markets (multiple outcomes) is architecturally straightforward but was out of scope.
- **Viewing keys**: Users cannot currently verify their own encrypted balance independently. Adding per-user viewing keys would allow balance verification without trusting the frontend.
- **Subgraph/indexer**: The Goldsky pipeline configuration exists but is not fully deployed. A production indexer would improve frontend query performance significantly.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Foundry, OpenZeppelin |
| TEE Application | Node.js 20+, iExec SDK, TweetNaCl, ethers.js |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Privy, wagmi/viem |
| Blockchain | Arbitrum Sepolia (testnet) |
| Storage | IPFS via Pinata |
| CI | GitHub Actions (Foundry build + test) |

## Team

Built during the iExec hackathon. The project demonstrates that confidential DeFi primitives are practical today using TEE-based approaches, without requiring fully homomorphic encryption or complex zero-knowledge circuits.
