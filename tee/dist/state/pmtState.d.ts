/**
 * Patricia Merkle Trie state wrapper
 *
 * Wraps @ethereumjs/trie with iPred-specific operations including:
 * - Key-value operations
 * - Lexicographic iteration for order matching
 * - Proof generation
 * - Snapshot/restore for persistence
 */
import { Trie, type Proof } from '@ethereumjs/trie';
import type { Hex } from 'viem';
/**
 * Iteration options for walking the trie
 */
export interface IterateOptions {
    /** Start key (inclusive), lexicographically */
    gte?: string;
    /** End key (exclusive), lexicographically */
    lt?: string;
    /** Maximum number of entries to return */
    limit?: number;
}
/**
 * Key-value pair from iteration
 */
export interface TrieEntry {
    key: string;
    value: Uint8Array;
}
/**
 * Merkle proof data
 */
export interface TrieProof {
    key: Uint8Array;
    value: Uint8Array | null;
    proof: Proof;
    root: Hex;
}
/**
 * PMT State wrapper class
 */
export declare class PMTState {
    private trie;
    private stateVersion;
    constructor();
    /**
     * Initialize the trie (empty or from snapshot)
     */
    initialize(snapshot?: Uint8Array): Promise<void>;
    /**
     * Get current root hash as hex string
     */
    getRoot(): Hex;
    /**
     * Get current state version
     */
    getStateVersion(): number;
    /**
     * Increment state version (called after commits)
     */
    incrementVersion(): number;
    /**
     * Set state version (for recovery)
     */
    setStateVersion(version: number): void;
    /**
     * Get value for a key
     */
    get(key: string): Promise<Uint8Array | null>;
    /**
     * Get value as parsed JSON
     */
    getJSON<T>(key: string): Promise<T | null>;
    /**
     * Put a value for a key
     */
    put(key: string, value: Uint8Array): Promise<void>;
    /**
     * Put a JSON value
     */
    putJSON<T>(key: string, value: T): Promise<void>;
    /**
     * Delete a key
     */
    del(key: string): Promise<void>;
    /**
     * Check if a key exists
     */
    has(key: string): Promise<boolean>;
    /**
     * Iterate over keys with prefix matching
     *
     * NOTE: @ethereumjs/trie doesn't have native range iteration,
     * so we walk all keys and filter. For production, consider
     * maintaining secondary indexes or using a different backend.
     */
    iterate(options?: IterateOptions): AsyncGenerator<TrieEntry>;
    /**
     * Iterate keys with a specific prefix
     */
    iteratePrefix(prefix: string, limit?: number): AsyncGenerator<TrieEntry>;
    /**
     * Get all keys with a specific prefix
     */
    getKeysWithPrefix(prefix: string): Promise<string[]>;
    /**
     * Create a Merkle proof for a key
     */
    createProof(key: string): Promise<TrieProof>;
    /**
     * Verify a Merkle proof
     *
     * Note: The root parameter is for validation purposes only.
     * The @ethereumjs/trie verifyProof API takes (key, proof, opts?)
     */
    verifyProof(_root: Hex, key: Uint8Array, proof: Proof): Promise<Uint8Array | null>;
    /**
     * Create a snapshot of the entire trie state
     *
     * Returns serialized trie data for persistence
     */
    createSnapshot(): Promise<Uint8Array>;
    /**
     * Load trie state from a snapshot
     */
    loadSnapshot(snapshot: Uint8Array): Promise<void>;
    /**
     * Verify the current root matches an expected value
     */
    verifyRoot(expectedRoot: Hex): boolean;
    /**
     * Create a checkpoint (for atomic operations)
     */
    checkpoint(): Promise<void>;
    /**
     * Commit checkpoint
     */
    commit(): Promise<void>;
    /**
     * Revert to last checkpoint
     */
    revert(): Promise<void>;
    /**
     * Get underlying trie (for advanced operations)
     */
    getTrie(): Trie;
}
/**
 * Create a new PMT state instance
 */
export declare function createPMTState(): PMTState;
//# sourceMappingURL=pmtState.d.ts.map