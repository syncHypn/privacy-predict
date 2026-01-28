/**
 * Patricia Merkle Trie state wrapper
 *
 * Wraps @ethereumjs/trie with iPred-specific operations including:
 * - Key-value operations
 * - Lexicographic iteration for order matching
 * - Proof generation
 * - Snapshot/restore for persistence
 */
import { Trie } from '@ethereumjs/trie';
import { bytesToHex } from '@ethereumjs/util';
import { StateError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('PMTState');
/**
 * PMT State wrapper class
 */
export class PMTState {
    trie;
    stateVersion = 0;
    constructor() {
        // Initialize empty trie with secure hashing
        this.trie = new Trie({ useKeyHashing: true });
    }
    /**
     * Initialize the trie (empty or from snapshot)
     */
    async initialize(snapshot) {
        if (snapshot) {
            await this.loadSnapshot(snapshot);
            logger.info('Initialized from snapshot', { root: this.getRoot() });
        }
        else {
            // Create genesis root
            await this.trie.checkpoint();
            await this.trie.commit();
            logger.info('Initialized empty trie', { root: this.getRoot() });
        }
    }
    /**
     * Get current root hash as hex string
     */
    getRoot() {
        return bytesToHex(this.trie.root());
    }
    /**
     * Get current state version
     */
    getStateVersion() {
        return this.stateVersion;
    }
    /**
     * Increment state version (called after commits)
     */
    incrementVersion() {
        this.stateVersion += 1;
        return this.stateVersion;
    }
    /**
     * Set state version (for recovery)
     */
    setStateVersion(version) {
        this.stateVersion = version;
    }
    /**
     * Get value for a key
     */
    async get(key) {
        try {
            const keyBytes = new TextEncoder().encode(key);
            const value = await this.trie.get(keyBytes);
            return value;
        }
        catch (error) {
            throw new StateError(`Failed to get key: ${key}`, {
                key,
                error: String(error),
            });
        }
    }
    /**
     * Get value as parsed JSON
     */
    async getJSON(key) {
        const value = await this.get(key);
        if (!value)
            return null;
        try {
            const text = new TextDecoder().decode(value);
            return JSON.parse(text);
        }
        catch (error) {
            throw new StateError(`Failed to parse JSON for key: ${key}`, {
                key,
                error: String(error),
            });
        }
    }
    /**
     * Put a value for a key
     */
    async put(key, value) {
        try {
            const keyBytes = new TextEncoder().encode(key);
            await this.trie.put(keyBytes, value);
        }
        catch (error) {
            throw new StateError(`Failed to put key: ${key}`, {
                key,
                error: String(error),
            });
        }
    }
    /**
     * Put a JSON value
     */
    async putJSON(key, value) {
        const text = JSON.stringify(value);
        const bytes = new TextEncoder().encode(text);
        await this.put(key, bytes);
    }
    /**
     * Delete a key
     */
    async del(key) {
        try {
            const keyBytes = new TextEncoder().encode(key);
            await this.trie.del(keyBytes);
        }
        catch (error) {
            throw new StateError(`Failed to delete key: ${key}`, {
                key,
                error: String(error),
            });
        }
    }
    /**
     * Check if a key exists
     */
    async has(key) {
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
    async *iterate(options = {}) {
        const { gte, lt, limit } = options;
        let count = 0;
        // Collect all keys matching the prefix (if provided via gte)
        const entries = [];
        // Walk the entire trie
        // This is inefficient but @ethereumjs/trie doesn't support range queries
        // For production, we should maintain secondary indexes
        const walkStream = this.trie.createReadStream();
        for await (const data of walkStream) {
            const key = new TextDecoder().decode(data.key);
            // Apply filters
            if (gte && key < gte)
                continue;
            if (lt && key >= lt)
                continue;
            entries.push({
                key,
                value: data.value,
            });
        }
        // Sort lexicographically (trie walk order may not be lexicographic)
        entries.sort((a, b) => a.key.localeCompare(b.key));
        // Yield entries
        for (const entry of entries) {
            if (limit && count >= limit)
                break;
            yield entry;
            count++;
        }
    }
    /**
     * Iterate keys with a specific prefix
     */
    async *iteratePrefix(prefix, limit) {
        yield* this.iterate({
            gte: prefix,
            lt: prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1),
            limit,
        });
    }
    /**
     * Get all keys with a specific prefix
     */
    async getKeysWithPrefix(prefix) {
        const keys = [];
        for await (const entry of this.iteratePrefix(prefix)) {
            keys.push(entry.key);
        }
        return keys;
    }
    /**
     * Create a Merkle proof for a key
     */
    async createProof(key) {
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
        }
        catch (error) {
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
    async verifyProof(_root, key, proof) {
        try {
            const value = await Trie.verifyProof(key, proof);
            return value;
        }
        catch (error) {
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
    async createSnapshot() {
        try {
            // Collect all key-value pairs
            const entries = [];
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
        }
        catch (error) {
            throw new StateError('Failed to create snapshot', {
                error: String(error),
            });
        }
    }
    /**
     * Load trie state from a snapshot
     */
    async loadSnapshot(snapshot) {
        try {
            const text = new TextDecoder().decode(snapshot);
            const data = JSON.parse(text);
            // Create fresh trie
            this.trie = new Trie({ useKeyHashing: true });
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
        }
        catch (error) {
            if (error instanceof StateError)
                throw error;
            throw new StateError('Failed to load snapshot', {
                error: String(error),
            });
        }
    }
    /**
     * Verify the current root matches an expected value
     */
    verifyRoot(expectedRoot) {
        return this.getRoot() === expectedRoot;
    }
    /**
     * Create a checkpoint (for atomic operations)
     */
    async checkpoint() {
        await this.trie.checkpoint();
    }
    /**
     * Commit checkpoint
     */
    async commit() {
        await this.trie.commit();
    }
    /**
     * Revert to last checkpoint
     */
    async revert() {
        await this.trie.revert();
    }
    /**
     * Get underlying trie (for advanced operations)
     */
    getTrie() {
        return this.trie;
    }
}
/**
 * Create a new PMT state instance
 */
export function createPMTState() {
    return new PMTState();
}
//# sourceMappingURL=pmtState.js.map