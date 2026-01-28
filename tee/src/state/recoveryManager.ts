/**
 * Recovery Manager
 *
 * Handles TEE restart and state recovery:
 * 1. Fetch current root from StateAnchor
 * 2. Load snapshot from IPFS
 * 3. Verify root matches
 * 4. Replay missed events
 */

import type { Hex } from 'viem';
import type { StateManager } from './stateManager.js';
import type { ContractCaller } from '../blockchain/contractCaller.js';
import type { EventListener } from '../blockchain/eventListener.js';
import { RecoveryError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RecoveryManager');

/**
 * Recovery state
 */
interface RecoveryState {
  onChainRoot: Hex;
  onChainVersion: bigint;
  snapshotCid?: string;
  snapshotVersion?: number;
  recoveredFromSnapshot: boolean;
  eventsReplayed: number;
}

/**
 * Recovery Manager class
 */
export class RecoveryManager {
  constructor(
    private stateManager: StateManager,
    private contractCaller: ContractCaller,
    private eventListener: EventListener
  ) {}

  /**
   * Recover state after TEE restart
   */
  async recover(): Promise<RecoveryState> {
    logger.info('Starting recovery process');

    const state: RecoveryState = {
      onChainRoot: '0x' as Hex,
      onChainVersion: 0n,
      recoveredFromSnapshot: false,
      eventsReplayed: 0,
    };

    try {
      // Step 1: Fetch on-chain state
      const onChainState = await this.fetchOnChainState();
      state.onChainRoot = onChainState.root;
      state.onChainVersion = onChainState.version;

      logger.info('Fetched on-chain state', {
        root: state.onChainRoot,
        version: state.onChainVersion.toString(),
      });

      // Check if we have any state to recover
      if (state.onChainVersion === 0n) {
        // Genesis state - no recovery needed
        logger.info('Genesis state - no recovery needed');
        await this.stateManager.getPMTState().initialize();
        return state;
      }

      // Step 2: Try to load from snapshot
      const metadata = await this.tryLoadSnapshot();
      if (metadata) {
        state.snapshotCid = metadata.cid;
        state.snapshotVersion = metadata.version;
        state.recoveredFromSnapshot = true;

        logger.info('Loaded from snapshot', {
          cid: metadata.cid,
          version: metadata.version,
        });
      } else {
        // No snapshot - initialize empty and replay all events
        logger.warn('No snapshot available - replaying all events');
        await this.stateManager.getPMTState().initialize();
      }

      // Step 3: Verify current state
      const currentRoot = this.stateManager.getRoot();
      const isConsistent = await this.verifyStateConsistency(
        currentRoot,
        state.onChainRoot
      );

      if (!isConsistent) {
        logger.warn('State inconsistency detected', {
          localRoot: currentRoot,
          onChainRoot: state.onChainRoot,
        });

        // Need to replay events from snapshot version to current
        const fromBlock = await this.getBlockForVersion(
          state.snapshotVersion ?? 0
        );
        state.eventsReplayed = await this.replayMissedEvents(fromBlock);
      }

      // Step 4: Final verification
      const finalRoot = this.stateManager.getRoot();
      if (finalRoot !== state.onChainRoot) {
        throw new RecoveryError('State recovery failed - root mismatch after replay', {
          localRoot: finalRoot,
          onChainRoot: state.onChainRoot,
        });
      }

      // Update state version
      this.stateManager.getPMTState().setStateVersion(Number(state.onChainVersion));

      logger.info('Recovery complete', {
        finalRoot,
        version: state.onChainVersion.toString(),
        eventsReplayed: state.eventsReplayed,
      });

      return state;
    } catch (error) {
      logger.error('Recovery failed', { error: String(error) });
      throw error instanceof RecoveryError
        ? error
        : new RecoveryError('Recovery failed', { error: String(error) });
    }
  }

  /**
   * Fetch current state from StateAnchor contract
   */
  private async fetchOnChainState(): Promise<{ root: Hex; version: bigint }> {
    const [root, version] = await Promise.all([
      this.contractCaller.getCurrentRoot(),
      this.contractCaller.getStateVersion(),
    ]);

    return { root, version };
  }

  /**
   * Try to load state from snapshot
   */
  private async tryLoadSnapshot(): Promise<{ cid: string; version: number } | null> {
    try {
      const metadata = await this.stateManager.getMetadata();

      if (!metadata.lastSnapshotCid) {
        return null;
      }

      await this.stateManager.loadSnapshot(metadata.lastSnapshotCid);

      return {
        cid: metadata.lastSnapshotCid,
        version: metadata.lastSnapshotVersion ?? 0,
      };
    } catch (error) {
      logger.warn('Failed to load snapshot', { error: String(error) });
      return null;
    }
  }

  /**
   * Verify local state matches on-chain root
   */
  private async verifyStateConsistency(
    localRoot: Hex,
    onChainRoot: Hex
  ): Promise<boolean> {
    if (localRoot === onChainRoot) {
      return true;
    }

    // Check if local root is a committed root (might be older version)
    const isCommitted = await this.contractCaller.isRootCommitted(localRoot);
    return isCommitted;
  }

  /**
   * Get block number for a state version
   *
   * This is a simplified implementation - in production,
   * we'd maintain a version -> block mapping
   */
  private async getBlockForVersion(version: number): Promise<bigint> {
    // For now, get from metadata if available
    const metadata = await this.stateManager.getMetadata();
    return metadata.lastProcessedBlock;
  }

  /**
   * Replay missed events to catch up state
   */
  private async replayMissedEvents(fromBlock: bigint): Promise<number> {
    logger.info('Replaying events', { fromBlock: fromBlock.toString() });

    let eventCount = 0;

    // Temporarily track event count via modified handlers
    const originalHandlers = { ...this.eventListener };

    // Note: The EventListener will process events through its registered handlers
    // The handlers should update state accordingly

    await this.eventListener.syncFromBlock(fromBlock);

    // Count would need to be tracked via the handlers
    // For now, return 0 as a placeholder
    return eventCount;
  }

  /**
   * Perform periodic consistency check
   */
  async performConsistencyCheck(): Promise<boolean> {
    try {
      const onChainState = await this.fetchOnChainState();
      const localRoot = this.stateManager.getRoot();

      if (localRoot !== onChainState.root) {
        logger.warn('Consistency check failed', {
          localRoot,
          onChainRoot: onChainState.root,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Consistency check error', { error: String(error) });
      return false;
    }
  }

  /**
   * Force state recovery from on-chain
   */
  async forceRecovery(): Promise<void> {
    logger.warn('Forcing state recovery');

    // Clear local state
    await this.stateManager.getPMTState().initialize();

    // Re-run full recovery
    await this.recover();
  }
}

/**
 * Create a recovery manager instance
 */
export function createRecoveryManager(
  stateManager: StateManager,
  contractCaller: ContractCaller,
  eventListener: EventListener
): RecoveryManager {
  return new RecoveryManager(stateManager, contractCaller, eventListener);
}
