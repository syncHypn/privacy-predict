# iPred Continuous iApp Architecture

> **Design for 24/7 Event Monitoring in iExec TEE**

## Executive Summary

This document outlines the architecture for a continuous-running iExec iApp that monitors Arbitrum Sepolia events 24/7, manages confidential AMM state in TEE memory, and updates on-chain balances - all without an external orchestrator.

## Challenge: iExec Task Model

Based on research ([iExec Worker](https://github.com/iExecBlockchainComputing/iexec-worker), [Deploy Workerpool](https://github.com/iExecBlockchainComputing/deploy-workerpool)), iExec's standard model is:

- **Discrete tasks**: Apps run once per task request, then terminate
- **No native persistence**: Tasks are stateless by design
- **Output-oriented**: Results written to `/iexec_out/` and uploaded

**Problem**: We need continuous monitoring, persistent state (AMM reserves), and ongoing transaction submission.

## Solution: Simulated Continuous Operation

Since true 24/7 TEE processes aren't standard in iExec, we implement **retriggering architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│           iApp Task Lifecycle (Simulated Continuous)         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 1. Task Starts                                      │    │
│  │    - Restore state from encrypted IPFS/on-chain    │    │
│  │    - Load sealed keys (SGX)                        │    │
│  │    - Connect to Arbitrum Sepolia RPC               │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │ 2. Event Monitor Loop (Duration: ~10 minutes)      │    │
│  │    - Poll Arbitrum events                          │    │
│  │    - Process deposits/buys/sells/redeems           │    │
│  │    - Update encrypted balances                     │    │
│  │    - Submit callbacks to contracts                 │    │
│  │    - Update AMM reserves in memory                 │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │ 3. Before Exit                                      │    │
│  │    - Persist AMM state (encrypted) to IPFS         │    │
│  │    - Write deterministic output (last block)       │    │
│  │    - Submit NEXT task to re-trigger itself         │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │ 4. Task Completes                                   │    │
│  │    - Results uploaded                              │    │
│  │    - Next task already queued                      │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Loop continues via self-triggering...                      │
└─────────────────────────────────────────────────────────────┘
```

### Why 10-Minute Windows?

- **Cost efficiency**: Shorter than hourly, long enough to batch events
- **State checkpointing**: Regular persistence reduces recovery window
- **iExec compatibility**: Standard task duration, not experimental

## Architecture Components

### 1. State Persistence Layer

**AMM Reserves Storage** (encrypted on IPFS):

```typescript
interface PersistedState {
  version: number;
  timestamp: number;
  lastProcessedBlock: number;
  reserves: {
    marketId: string;
    encryptedReserveUSDC: string;  // NaCl encrypted with sealed key
    encryptedReserveYES: string;
    encryptedReserveNO: string;
  }[];
  stateRoot: string;  // Merkle root for verification
}
```

**Storage Strategy**:
- Write to IPFS at task end (encrypted with sealed key)
- Store IPFS CID on-chain (in a lightweight StateRegistry contract)
- Next task reads CID from contract → fetches from IPFS → decrypts

### 2. Event Monitoring System

```typescript
// In iApp main loop
class ContinuousEventMonitor {
  private rpcUrl: string;  // From requester secret
  private provider: ethers.JsonRpcProvider;
  private lastBlock: number;

  async run(maxDurationMs: number = 10 * 60 * 1000) {
    const startTime = Date.now();

    // Restore state
    await this.restoreState();

    // Monitor until time limit
    while (Date.now() - startTime < maxDurationMs) {
      const currentBlock = await this.provider.getBlockNumber();

      // Poll for events
      const events = await this.fetchEvents(
        this.lastBlock + 1,
        currentBlock
      );

      // Process each event
      for (const event of events) {
        await this.processEvent(event);
      }

      this.lastBlock = currentBlock;

      // Wait before next poll (anti-spam)
      await sleep(5000);  // 5 seconds
    }

    // Persist and trigger next task
    await this.persistState();
    await this.triggerNextTask();
  }

  async fetchEvents(fromBlock: number, toBlock: number) {
    // Query all relevant contracts
    const depositEvents = await cUSDC.queryFilter(
      cUSDC.filters.DepositRequested(),
      fromBlock,
      toBlock
    );
    const buyEvents = await predictionMarket.queryFilter(
      predictionMarket.filters.BuyRequested(),
      fromBlock,
      toBlock
    );
    // ... other events

    return [...depositEvents, ...buyEvents, ...];
  }

  async processEvent(event: Event) {
    // Decrypt, compute, update balances
    // (Same logic as current orchestrator)
    await this.actionHandler.handle(event);
  }
}
```

### 3. Self-Triggering Mechanism

**Option A: Direct iExec SDK Call** (Recommended)

```typescript
import { IExec } from 'iexec';

async function triggerNextTask() {
  const iexec = new IExec({
    ethProvider: process.env.ARBITRUM_RPC_URL,
  });

  // Submit next task with same params
  const taskId = await iexec.task.run({
    app: process.env.IAPP_ADDRESS,  // Self-reference
    requesterSecret: {
      1: process.env.ARBITRUM_RPC_URL,
      2: process.env.PRIVATE_KEY,
      3: process.env.SEALED_KEY,
    },
    category: 2,  // Standard TEE
    tag: ['tee', 'scone'],
    trust: 1,
  });

  console.log(`Next task scheduled: ${taskId}`);
}
```

**Option B: On-Chain Trigger Contract** (Fallback)

Deploy a simple contract on Bellecour that auto-triggers tasks on a schedule.

### 4. Wallet Key Management

**Private Key Strategy**:

1. **Requester Secret** (Bootstrap):
   - Initial private key passed as requester secret
   - Used ONLY to sign first transaction
   - Immediately sealed into SGX enclave

2. **SGX Sealing**:
```typescript
import { sealData, unsealData } from '@iexec/sgx-sealing';

// First run: Seal the private key
const sealedKey = await sealData(process.env.PRIVATE_KEY);
await fs.writeFile('/sealed/wallet.key', sealedKey);

// Subsequent runs: Unseal
const privateKey = await unsealData('/sealed/wallet.key');
const wallet = new ethers.Wallet(privateKey, provider);
```

3. **Funding Strategy**:
   - Keep wallet funded with ETH for gas
   - Monitor balance, emit alert if low
   - Auto-refund from treasury contract (future)

### 5. State Recovery on Crash

```typescript
async restoreState(): Promise<void> {
  try {
    // 1. Fetch latest state CID from on-chain registry
    const stateRegistry = new ethers.Contract(
      STATE_REGISTRY_ADDRESS,
      STATE_REGISTRY_ABI,
      provider
    );
    const latestCID = await stateRegistry.getLatestStateCID();

    // 2. Fetch encrypted state from IPFS
    const encryptedState = await fetchFromIPFS(latestCID);

    // 3. Decrypt with sealed key
    const sealedKey = await unsealData('/sealed/sealed.key');
    const state = decryptState(encryptedState, sealedKey);

    // 4. Restore AMM reserves
    this.reserves = state.reserves;
    this.lastProcessedBlock = state.lastProcessedBlock;

    console.log(`State restored from block ${this.lastProcessedBlock}`);
  } catch (error) {
    console.error('State recovery failed, rebuilding from genesis...');
    await this.rebuildStateFromHistory();
  }
}

async rebuildStateFromHistory(): Promise<void> {
  // Fallback: Replay all events from contract deployment
  const deploymentBlock = 12345;  // From contract deployment
  const allEvents = await this.fetchEvents(deploymentBlock, 'latest');

  // Process chronologically
  for (const event of allEvents) {
    await this.processEvent(event);
  }

  console.log('State rebuilt from history');
}
```

## Cross-Chain Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Arbitrum Sepolia                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │  cUSDC      │  │ Prediction   │  │  cYES / cNO     │     │
│  │  Contract   │  │  Market      │  │  Contracts      │     │
│  └─────┬───────┘  └──────┬───────┘  └─────┬───────────┘     │
│        │                 │                 │                  │
│        └─────────────────┼─────────────────┘                  │
│                          │                                    │
│                          │ Events                             │
│                          │ (Deposit, Buy, Sell, Redeem)       │
│                          │                                    │
└──────────────────────────┼────────────────────────────────────┘
                           │
                           │ RPC Connection
                           │ (via requester secret)
                           │
┌──────────────────────────▼────────────────────────────────────┐
│                    iExec Bellecour                             │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │               iApp TEE (Continuous)                       │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ Event Monitor                                       │  │ │
│  │  │  - Polls Arbitrum RPC                              │  │ │
│  │  │  - Processes events                                │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ AMM State (In-Memory)                              │  │ │
│  │  │  - reserveUSDC, reserveYES, reserveNO              │  │ │
│  │  │  - Decrypts/encrypts balances                      │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ Transaction Submitter                              │  │ │
│  │  │  - Signs with sealed wallet key                   │  │ │
│  │  │  - Submits to Arbitrum contracts                  │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ State Persistence                                  │  │ │
│  │  │  - Writes encrypted state to IPFS                 │  │ │
│  │  │  - Updates StateRegistry CID                      │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ StateRegistry Contract (on Bellecour)                    │ │
│  │  - Stores latest state IPFS CID                          │ │
│  │  - Only writable by iApp                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                           │
                           │ IPFS
                           │
┌──────────────────────────▼────────────────────────────────────┐
│                      IPFS Storage                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Encrypted State Snapshots (CID-addressable)              │ │
│  │  - AMM reserves (encrypted with sealed key)             │ │
│  │  - Last processed block                                 │ │
│  │  - Merkle proofs                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## Required Smart Contract Additions

### StateRegistry.sol (Deploy on Bellecour)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StateRegistry {
    address public iappTEE;  // Only iApp can update
    string public latestStateCID;
    uint256 public lastUpdateBlock;

    event StateUpdated(string indexed cid, uint256 blockNumber);

    modifier onlyTEE() {
        require(msg.sender == iappTEE, "Only TEE");
        _;
    }

    function updateStateCID(string calldata newCID) external onlyTEE {
        latestStateCID = newCID;
        lastUpdateBlock = block.number;
        emit StateUpdated(newCID, block.number);
    }

    function getLatestStateCID() external view returns (string memory) {
        return latestStateCID;
    }
}
```

## File Structure

```
ipred-tee/
├── src/
│   ├── index.ts              # Main entry point
│   ├── monitor.ts            # ContinuousEventMonitor
│   ├── state-manager.ts      # State persistence/recovery
│   ├── action-handler.ts     # Event processing logic
│   ├── callback-submitter.ts # Transaction submission
│   ├── self-trigger.ts       # Next task triggering
│   └── utils/
│       ├── encryption.ts     # NaCl encryption
│       ├── sgx-sealing.ts    # SGX key management
│       └── ipfs.ts           # IPFS read/write
├── contracts/
│   └── StateRegistry.sol     # State CID storage
├── Dockerfile
├── iapp.config.json
└── package.json
```

## Main Entry Point

```typescript
// src/index.ts
import { ContinuousEventMonitor } from './monitor';
import { StateManager } from './state-manager';
import { SelfTrigger } from './self-trigger';

async function main() {
  console.log('iPred Continuous iApp Starting...');

  // 1. Initialize components
  const stateManager = new StateManager();
  const monitor = new ContinuousEventMonitor(stateManager);
  const trigger = new SelfTrigger();

  try {
    // 2. Run monitoring loop (10 minutes)
    await monitor.run(10 * 60 * 1000);

    // 3. Persist state before exit
    await stateManager.persistState();

    // 4. Trigger next task
    await trigger.triggerNext();

    // 5. Write deterministic output for iExec
    await writeComputedJson({
      'deterministic-output-path': 'result.json',
      lastBlock: monitor.lastProcessedBlock,
      timestamp: Date.now(),
    });

    console.log('Task completed, next task triggered');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    // Still persist state on error
    await stateManager.persistState();
    process.exit(1);
  }
}

main();
```

## Bootstrap Process

### Initial Deployment

1. **Deploy StateRegistry** on Bellecour:
   ```bash
   forge create StateRegistry --rpc-url $BELLECOUR_RPC --private-key $PK
   ```

2. **Deploy iApp**:
   ```bash
   cd ipred-tee
   iapp deploy
   ```

3. **Bootstrap First Task**:
   ```bash
   iapp run <iapp-address> \
     --requesterSecret 1=$ARBITRUM_RPC_URL \
     --requesterSecret 2=$PRIVATE_KEY \
     --requesterSecret 3=$SEALED_KEY \
     --tag tee,scone
   ```

4. **Monitor**: Tasks self-perpetuate from here

## Cost Analysis

| Component | Cost | Frequency |
|-----------|------|-----------|
| iApp Task | ~$0.10 - $1.00 | Every 10 min |
| IPFS Storage | ~$0.001 | Per checkpoint |
| Arbitrum Gas | ~$0.01 - $0.05 | Per callback |

**Daily Estimate**:
- Tasks: 144/day × $0.50 = **$72/day**
- IPFS: 144 × $0.001 = **$0.14/day**
- Gas: Variable, ~**$5-20/day**

**Total**: ~**$77-92/day** for continuous operation

**Optimization**:
- Increase window to 30 minutes → $26-32/day
- Batch multiple events per callback
- Use iExec credits/subsidies

## Failure Modes & Recovery

| Failure | Recovery Strategy |
|---------|------------------|
| Task crashes mid-run | Next task restores from last IPFS checkpoint |
| IPFS unavailable | Rebuild state from blockchain history |
| Wallet runs out of gas | Monitor balance, emit alert, pause tasks |
| Self-trigger fails | Manual task submission, then auto-resume |
| State corruption | Rollback to previous CID, replay events |

## Security Considerations

1. **RPC Key Exposure**: Arbitrum RPC URL as requester secret is visible to requester
   - Mitigation: Use public RPC or dedicated endpoint

2. **Private Key in TEE**: Wallet key sealed in SGX
   - Mitigation: Verify SGX attestation, use dedicated wallet with limited funds

3. **State Tampering**: IPFS CID on-chain prevents state rollback
   - Mitigation: Merkle proofs in state for verification

## Alternative: Custom Worker Pool

**If budget allows**, deploy a custom iExec worker pool:

- Run dedicated TEE workers 24/7
- No task limits or retriggering
- Full control over scheduling

See [Deploy Workerpool](https://github.com/iExecBlockchainComputing/deploy-workerpool) for setup.

## Next Steps

1. Implement core monitoring loop
2. Build state persistence layer
3. Test self-triggering locally
4. Deploy StateRegistry contract
5. Deploy and bootstrap iApp
6. Monitor first 24 hours of operation

## References

- [iExec Worker](https://github.com/iExecBlockchainComputing/iexec-worker)
- [Deploy Workerpool](https://github.com/iExecBlockchainComputing/deploy-workerpool)
- [Build Intel TDX iApp](https://docs.iex.ec/guides/build-iapp/advanced/build-your-first-tdx-iapp)
- [Manage a Workerpool](https://protocol.docs.iex.ec/for-workers/manage-a-pool-of-workers)
