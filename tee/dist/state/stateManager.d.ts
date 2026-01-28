/**
 * State Manager
 *
 * Coordinates state operations including:
 * - Encrypted balance management
 * - IPFS snapshot persistence
 * - State metadata tracking
 */
import type { Address, Hex } from 'viem';
import type { StateMetadata, TEEMode, UserBalance } from '../types.js';
import type { KeyManager } from '../crypto/keyManager.js';
import type { PMTState } from './pmtState.js';
/**
 * IPFS client interface (minimal for MVP)
 */
export interface IPFSClient {
    add(data: Uint8Array): Promise<string>;
    get(cid: string): Promise<Uint8Array>;
}
/**
 * Simple in-memory IPFS mock for local development
 */
export declare class InMemoryIPFS implements IPFSClient {
    private storage;
    private counter;
    add(data: Uint8Array): Promise<string>;
    get(cid: string): Promise<Uint8Array>;
}
/**
 * State Manager class
 */
export declare class StateManager {
    private pmtState;
    private keyManager;
    private ipfsClient;
    private snapshotInterval;
    private matchesSinceSnapshot;
    constructor(pmtState: PMTState, keyManager: KeyManager, ipfsClient: IPFSClient, snapshotInterval?: number);
    /**
     * Get user balance (decrypted)
     */
    getBalance(userId: Address): Promise<UserBalance>;
    /**
     * Update user balance (encrypted)
     */
    updateBalance(userId: Address, balance: UserBalance): Promise<void>;
    /**
     * Add to available balance (e.g., deposit)
     */
    addAvailableBalance(userId: Address, amount: bigint): Promise<UserBalance>;
    /**
     * Lock balance for order
     */
    lockBalance(userId: Address, amount: bigint): Promise<void>;
    /**
     * Unlock balance (e.g., order cancelled)
     */
    unlockBalance(userId: Address, amount: bigint): Promise<void>;
    /**
     * Settle balance (convert locked to available, adjust by delta)
     */
    settleBalance(userId: Address, lockedAmount: bigint, payout: bigint): Promise<void>;
    /**
     * Get state metadata
     */
    getMetadata(): Promise<StateMetadata>;
    /**
     * Update state metadata
     */
    updateMetadata(updates: Partial<StateMetadata>): Promise<void>;
    /**
     * Get last processed block
     */
    getLastProcessedBlock(): Promise<bigint>;
    /**
     * Update last processed block
     */
    setLastProcessedBlock(blockNumber: bigint): Promise<void>;
    /**
     * Get TEE mode
     */
    getMode(): Promise<TEEMode>;
    /**
     * Set TEE mode
     */
    setMode(mode: TEEMode): Promise<void>;
    /**
     * Save state snapshot to IPFS
     */
    saveSnapshot(): Promise<string>;
    /**
     * Load state snapshot from IPFS
     */
    loadSnapshot(cid: string): Promise<void>;
    /**
     * Check if snapshot is needed based on match count
     */
    shouldSnapshot(): boolean;
    /**
     * Increment match counter
     */
    recordMatch(): void;
    /**
     * Get snapshot CID for a version
     */
    getSnapshotCid(version: number): Promise<string | undefined>;
    /**
     * Encrypt arbitrary data for storage
     */
    encryptData(data: Uint8Array): Uint8Array;
    /**
     * Decrypt arbitrary data from storage
     */
    decryptData(encrypted: Uint8Array): Uint8Array;
    /**
     * Get current root
     */
    getRoot(): Hex;
    /**
     * Get state version
     */
    getStateVersion(): number;
    /**
     * Increment state version
     */
    incrementVersion(): number;
    /**
     * Get underlying PMT state (for advanced operations)
     */
    getPMTState(): PMTState;
}
/**
 * Create a state manager instance
 */
export declare function createStateManager(pmtState: PMTState, keyManager: KeyManager, ipfsClient?: IPFSClient, snapshotInterval?: number): StateManager;
//# sourceMappingURL=stateManager.d.ts.map