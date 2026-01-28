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
import { bytesToHex, hexToBytes } from '@ethereumjs/util';
import type { Hex } from 'viem';
import { StateError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PMTState');

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
export class PMTState {
  private trie: Trie;
  private stateVersion: number = 0;

  constructor() {
    // Initialize empty trie without key hashing to preserve lexicographic ordering
    // NOTE: useKeyHashing: true breaks createReadStream() - it returns hashed keys
    // instead of original keys, making prefix iteration impossible
    this.trie = new Trie({ useKeyHashing: false });
  }

  /**
   * Initialize the trie (empty or from snapshot)
   */
  async initialize(snapshot?: Uint8Array): Promise<void> {
    if (snapshot) {
      await this.loadSnapshot(snapshot);
      logger.info('Initialized from snapshot', { root: this.getRoot() });
    } else {
      // Create genesis root
      await this.trie.checkpoint();
      await this.trie.commit();
      logger.info('Initialized empty trie', { root: this.getRoot() });
    }
  }

  /**
   * Get current root hash as hex string
   */
  getRoot(): Hex {
    return bytesToHex(this.trie.root()) as Hex;
  }

  /**
   * Get current state version
   */
  getStateVersion(): number {
    return this.stateVersion;
  }

  /**
   * Increment state version (called after commits)
   */
  incrementVersion(): number {
    this.stateVersion += 1;
    return this.stateVersion;
  }

  /**
   * Set state version (for recovery)
   */
  setStateVersion(version: number): void {
    this.stateVersion = version;
  }

  /**
   * Get value for a key
   */
  async get(key: string): Promise<Uint8Array | null> {
    try {
      const keyBytes = new TextEncoder().encode(key);
      const value = await this.trie.get(keyBytes);
      return value;
    } catch (error) {
      throw new StateError(`Failed to get key: ${key}`, {
        key,
        error: String(error),
      });
    }
  }

  /**
   * Get value as parsed JSON
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      const text = new TextDecoder().decode(value);
      return JSON.parse(text) as T;
    } catch (error) {
      throw new StateError(`Failed to parse JSON for key: ${key}`, {
        key,
        error: String(error),
      });
    }
  }

  /**
   * Put a value for a key
   */
  async put(key: string, value: Uint8Array): Promise<void> {
    try {
      const keyBytes = new TextEncoder().encode(key);
      await this.trie.put(keyBytes, value);
    } catch (error) {
      throw new StateError(`Failed to put key: ${key}`, {
        key,
        error: String(error),
      });
    }
  }

  /**
   * Put a JSON value
   */
  async putJSON<T>(key: string, value: T): Promise<void> {
    const text = JSON.stringify(value);
    const bytes = new TextEncoder().encode(text);
    await this.put(key, bytes);
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    try {
      const keyBytes = new TextEncoder().encode(key);
      await this.trie.del(keyBytes);
    } catch (error) {
      throw new StateError(`Failed to delete key: ${key}`, {
        key,
        error: String(error),
      });
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Iterate over keys with prefix matching
   *
   * NOTE: @ethereumjs/trie doesn't have native range iteration,
   * so we walk all keys and filter. For production, consider
   * maintaining secondary indexes or using a different backend.
   */
  async *iterate(options: IterateOptions = {}): AsyncGenerator<TrieEntry> {
    const { gte, lt, limit } = options;
    let count = 0;

    // Collect all keys matching the prefix (if provided via gte)
    const entries: TrieEntry[] = [];

    // Walk the entire trie
    // This is inefficient but @ethereumjs/trie doesn't support range queries
    // For production, we should maintain secondary indexes
    const walkStream = this.trie.createReadStream();

    for await (const data of walkStream) {
      const key = new TextDecoder().decode(data.key);

      // Apply filters
      if (gte && key < gte) continue;
      if (lt && key >= lt) continue;

      entries.push({
        key,
        value: data.value,
      });
    }

    // Sort lexicographically (trie walk order may not be lexicographic)
    entries.sort((a, b) => a.key.localeCompare(b.key));

    // Yield entries
    for (const entry of entries) {
      if (limit && count >= limit) break;
      yield entry;
      count++;
    }
  }

  /**
   * Iterate keys with a specific prefix
   */
  async *iteratePrefix(prefix: string, limit?: number): AsyncGenerator<TrieEntry> {
    yield* this.iterate({
      gte: prefix,
      lt: prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1),
      limit,
    });
  }

  /**
   * Get all keys with a specific prefix
   */
  async getKeysWithPrefix(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const entry of this.iteratePrefix(prefix)) {
      keys.push(entry.key);
    }
    return keys;
  }

  /**
   * Create a Merkle proof for a key
   */
  async createProof(key: string): Promise<TrieProof> {
    try {
      const keyBytes = new TextEncoder().encode(key);
      const proof = await this.trie.createProof(keyBytes);
      const value = await this.get(key);

      return {
        key: keyBytes,
        value,
        proof,
        root: this.getRoot(),
      };
    } catch (error) {
      throw new StateError(`Failed to create proof for key: ${key}`, {
        key,
        error: String(error),
      });
    }
  }

  /**
   * Verify a Merkle proof
   *
   * Note: The root parameter is for validation purposes only.
   * The @ethereumjs/trie verifyProof API takes (key, proof, opts?)
   */
  async verifyProof(
    _root: Hex,
    key: Uint8Array,
    proof: Proof
  ): Promise<Uint8Array | null> {
    try {
      const value = await Trie.verifyProof(key, proof);
      return value;
    } catch (error) {
      throw new StateError('Proof verification failed', {
        error: String(error),
      });
    }
  }

  /**
   * Create a snapshot of the entire trie state
   *
   * Returns serialized trie data for persistence
   */
  async createSnapshot(): Promise<Uint8Array> {
    try {
      // Collect all key-value pairs
      const entries: Array<{ key: Uint8Array; value: Uint8Array }> = [];

      const walkStream = this.trie.createReadStream();
      for await (const data of walkStream) {
        entries.push({
          key: data.key,
          value: data.value,
        });
      }

      // Serialize as JSON with base64 encoding
      const serialized = JSON.stringify({
        version: this.stateVersion,
        root: this.getRoot(),
        entries: entries.map(e => ({
          key: Buffer.from(e.key).toString('base64'),
          value: Buffer.from(e.value).toString('base64'),
        })),
      });

      return new TextEncoder().encode(serialized);
    } catch (error) {
      throw new StateError('Failed to create snapshot', {
        error: String(error),
      });
    }
  }

  /**
   * Load trie state from a snapshot
   */
  async loadSnapshot(snapshot: Uint8Array): Promise<void> {
    try {
      const text = new TextDecoder().decode(snapshot);
      const data = JSON.parse(text) as {
        version: number;
        root: string;
        entries: Array<{ key: string; value: string }>;
      };

      // Create fresh trie
      this.trie = new Trie({ useKeyHashing: false });

      // Restore all entries
      for (const entry of data.entries) {
        const key = Buffer.from(entry.key, 'base64');
        const value = Buffer.from(entry.value, 'base64');
        await this.trie.put(key, value);
      }

      // Verify root matches
      const computedRoot = this.getRoot();
      if (computedRoot !== data.root) {
        throw new StateError('Snapshot root mismatch', {
          expected: data.root,
          computed: computedRoot,
        });
      }

      this.stateVersion = data.version;

      logger.info('Loaded snapshot', {
        version: this.stateVersion,
        root: computedRoot,
        entryCount: data.entries.length,
      });
    } catch (error) {
      if (error instanceof StateError) throw error;
      throw new StateError('Failed to load snapshot', {
        error: String(error),
      });
    }
  }

  /**
   * Verify the current root matches an expected value
   */
  verifyRoot(expectedRoot: Hex): boolean {
    return this.getRoot() === expectedRoot;
  }

  /**
   * Create a checkpoint (for atomic operations)
   */
  async checkpoint(): Promise<void> {
    await this.trie.checkpoint();
  }

  /**
   * Commit checkpoint
   */
  async commit(): Promise<void> {
    await this.trie.commit();
  }

  /**
   * Revert to last checkpoint
   */
  async revert(): Promise<void> {
    await this.trie.revert();
  }

  /**
   * Get underlying trie (for advanced operations)
   */
  getTrie(): Trie {
    return this.trie;
  }
}

/**
 * Create a new PMT state instance
 */
export function createPMTState(): PMTState {
  return new PMTState();
}
