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
export declare class RecoveryManager {
    private stateManager;
    private contractCaller;
    private eventListener;
    constructor(stateManager: StateManager, contractCaller: ContractCaller, eventListener: EventListener);
    /**
     * Recover state after TEE restart
     */
    recover(): Promise<RecoveryState>;
    /**
     * Fetch current state from StateAnchor contract
     */
    private fetchOnChainState;
    /**
     * Try to load state from snapshot
     */
    private tryLoadSnapshot;
    /**
     * Verify local state matches on-chain root
     */
    private verifyStateConsistency;
    /**
     * Get block number for a state version
     *
     * This is a simplified implementation - in production,
     * we'd maintain a version -> block mapping
     */
    private getBlockForVersion;
    /**
     * Replay missed events to catch up state
     */
    private replayMissedEvents;
    /**
     * Perform periodic consistency check
     */
    performConsistencyCheck(): Promise<boolean>;
    /**
     * Force state recovery from on-chain
     */
    forceRecovery(): Promise<void>;
}
/**
 * Create a recovery manager instance
 */
export declare function createRecoveryManager(stateManager: StateManager, contractCaller: ContractCaller, eventListener: EventListener): RecoveryManager;
export {};
//# sourceMappingURL=recoveryManager.d.ts.map