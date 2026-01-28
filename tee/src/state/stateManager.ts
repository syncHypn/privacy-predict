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
import { secretBoxEncrypt, secretBoxDecrypt } from '../crypto/encryption.js';
import type { KeyManager } from '../crypto/keyManager.js';
import { StateError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import { encodeBalanceKey, encodeMetaKey } from '../matching/priceEncoder.js';
import type { PMTState } from './pmtState.js';

const logger = createLogger('StateManager');

/**
 * IPFS client interface (minimal for MVP)
 */
export interface IPFSClient {
  add(data: Uint8Array): Promise<string>; // Returns CID
  get(cid: string): Promise<Uint8Array>;
}

/**
 * Simple in-memory IPFS mock for local development
 */
export class InMemoryIPFS implements IPFSClient {
  private storage = new Map<string, Uint8Array>();
  private counter = 0;

  async add(data: Uint8Array): Promise<string> {
    const cid = `Qm${this.counter++}${Date.now()}`;
    this.storage.set(cid, data);
    return cid;
  }

  async get(cid: string): Promise<Uint8Array> {
    const data = this.storage.get(cid);
    if (!data) {
      throw new Error(`CID not found: ${cid}`);
    }
    return data;
  }
}

/**
 * State Manager class
 */
export class StateManager {
  private matchesSinceSnapshot = 0;

  constructor(
    private pmtState: PMTState,
    private keyManager: KeyManager,
    private ipfsClient: IPFSClient,
    private snapshotInterval: number = 100
  ) {}

  // ============================================================================
  // Balance Operations
  // ============================================================================

  /**
   * Get user balance (decrypted)
   */
  async getBalance(userId: Address): Promise<UserBalance> {
    const key = encodeBalanceKey(userId);
    const encrypted = await this.pmtState.get(key);

    if (!encrypted) {
      // Return zero balance for new users
      return { available: 0n, locked: 0n };
    }

    try {
      const decrypted = secretBoxDecrypt(encrypted, this.keyManager.getSealedKey());
      const text = new TextDecoder().decode(decrypted);
      const data = JSON.parse(text) as { available: string; locked: string };
      return {
        available: BigInt(data.available),
        locked: BigInt(data.locked),
      };
    } catch (error) {
      throw new StateError(`Failed to decrypt balance for ${userId}`, {
        error: String(error),
      });
    }
  }

  /**
   * Update user balance (encrypted)
   */
  async updateBalance(userId: Address, balance: UserBalance): Promise<void> {
    const key = encodeBalanceKey(userId);
    const data = {
      available: balance.available.toString(),
      locked: balance.locked.toString(),
    };
    const text = JSON.stringify(data);
    const bytes = new TextEncoder().encode(text);
    const encrypted = secretBoxEncrypt(bytes, this.keyManager.getSealedKey());

    await this.pmtState.put(key, encrypted);
  }

  /**
   * Add to available balance (e.g., deposit)
   */
  async addAvailableBalance(userId: Address, amount: bigint): Promise<UserBalance> {
    const balance = await this.getBalance(userId);
    balance.available += amount;
    await this.updateBalance(userId, balance);
    return balance;
  }

  /**
   * Lock balance for order
   */
  async lockBalance(userId: Address, amount: bigint): Promise<void> {
    const balance = await this.getBalance(userId);

    if (balance.available < amount) {
      throw new StateError(`Insufficient available balance: ${balance.available} < ${amount}`);
    }

    balance.available -= amount;
    balance.locked += amount;
    await this.updateBalance(userId, balance);
  }

  /**
   * Unlock balance (e.g., order cancelled)
   */
  async unlockBalance(userId: Address, amount: bigint): Promise<void> {
    const balance = await this.getBalance(userId);

    if (balance.locked < amount) {
      throw new StateError(`Insufficient locked balance: ${balance.locked} < ${amount}`);
    }

    balance.locked -= amount;
    balance.available += amount;
    await this.updateBalance(userId, balance);
  }

  /**
   * Settle balance (convert locked to available, adjust by delta)
   */
  async settleBalance(userId: Address, lockedAmount: bigint, payout: bigint): Promise<void> {
    const balance = await this.getBalance(userId);

    // Remove from locked
    balance.locked -= lockedAmount;

    // Add payout to available
    balance.available += payout;

    await this.updateBalance(userId, balance);
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  /**
   * Get state metadata
   */
  async getMetadata(): Promise<StateMetadata> {
    const key = encodeMetaKey('state');
    const data = await this.pmtState.getJSON<StateMetadata>(key);

    if (!data) {
      // Default metadata
      return {
        lastProcessedBlock: 0n,
        stateVersion: 0,
        mode: 'NORMAL',
      };
    }

    // Convert BigInt from string
    return {
      ...data,
      lastProcessedBlock: BigInt(data.lastProcessedBlock.toString()),
    };
  }

  /**
   * Update state metadata
   */
  async updateMetadata(updates: Partial<StateMetadata>): Promise<void> {
    const current = await this.getMetadata();
    const updated = { ...current, ...updates };

    // Convert BigInt to string for JSON
    const serializable = {
      ...updated,
      lastProcessedBlock: updated.lastProcessedBlock.toString(),
    };

    const key = encodeMetaKey('state');
    await this.pmtState.putJSON(key, serializable);
  }

  /**
   * Get last processed block
   */
  async getLastProcessedBlock(): Promise<bigint> {
    const metadata = await this.getMetadata();
    return metadata.lastProcessedBlock;
  }

  /**
   * Update last processed block
   */
  async setLastProcessedBlock(blockNumber: bigint): Promise<void> {
    await this.updateMetadata({ lastProcessedBlock: blockNumber });
  }

  /**
   * Get TEE mode
   */
  async getMode(): Promise<TEEMode> {
    const metadata = await this.getMetadata();
    return metadata.mode;
  }

  /**
   * Set TEE mode
   */
  async setMode(mode: TEEMode): Promise<void> {
    await this.updateMetadata({ mode });
    logger.info('TEE mode changed', { mode });
  }

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  /**
   * Save state snapshot to IPFS
   */
  async saveSnapshot(): Promise<string> {
    try {
      // Create snapshot
      const snapshot = await this.pmtState.createSnapshot();

      // Encrypt snapshot
      const encrypted = secretBoxEncrypt(snapshot, this.keyManager.getSealedKey());

      // Upload to IPFS
      const cid = await this.ipfsClient.add(encrypted);

      // Update metadata
      const version = this.pmtState.getStateVersion();
      await this.updateMetadata({
        lastSnapshotCid: cid,
        lastSnapshotVersion: version,
      });

      this.matchesSinceSnapshot = 0;

      logger.info('Saved snapshot', { cid, version });
      return cid;
    } catch (error) {
      throw new StateError('Failed to save snapshot', { error: String(error) });
    }
  }

  /**
   * Load state snapshot from IPFS
   */
  async loadSnapshot(cid: string): Promise<void> {
    try {
      // Download from IPFS
      const encrypted = await this.ipfsClient.get(cid);

      // Decrypt
      const snapshot = secretBoxDecrypt(encrypted, this.keyManager.getSealedKey());

      // Load into PMT
      await this.pmtState.loadSnapshot(snapshot);

      logger.info('Loaded snapshot', {
        cid,
        version: this.pmtState.getStateVersion(),
        root: this.pmtState.getRoot(),
      });
    } catch (error) {
      throw new StateError('Failed to load snapshot', { cid, error: String(error) });
    }
  }

  /**
   * Check if snapshot is needed based on match count
   */
  shouldSnapshot(): boolean {
    return this.matchesSinceSnapshot >= this.snapshotInterval;
  }

  /**
   * Increment match counter
   */
  recordMatch(): void {
    this.matchesSinceSnapshot++;
  }

  /**
   * Get snapshot CID for a version
   */
  async getSnapshotCid(version: number): Promise<string | undefined> {
    const metadata = await this.getMetadata();
    if (metadata.lastSnapshotVersion === version) {
      return metadata.lastSnapshotCid;
    }
    // For full version history, we'd need a separate index
    return undefined;
  }

  // ============================================================================
  // State Encryption
  // ============================================================================

  /**
   * Encrypt arbitrary data for storage
   */
  encryptData(data: Uint8Array): Uint8Array {
    return secretBoxEncrypt(data, this.keyManager.getSealedKey());
  }

  /**
   * Decrypt arbitrary data from storage
   */
  decryptData(encrypted: Uint8Array): Uint8Array {
    return secretBoxDecrypt(encrypted, this.keyManager.getSealedKey());
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current root
   */
  getRoot(): Hex {
    return this.pmtState.getRoot();
  }

  /**
   * Get state version
   */
  getStateVersion(): number {
    return this.pmtState.getStateVersion();
  }

  /**
   * Increment state version
   */
  incrementVersion(): number {
    return this.pmtState.incrementVersion();
  }

  /**
   * Get underlying PMT state (for advanced operations)
   */
  getPMTState(): PMTState {
    return this.pmtState;
  }
}

/**
 * Create a state manager instance
 */
export function createStateManager(
  pmtState: PMTState,
  keyManager: KeyManager,
  ipfsClient?: IPFSClient,
  snapshotInterval?: number
): StateManager {
  return new StateManager(
    pmtState,
    keyManager,
    ipfsClient ?? new InMemoryIPFS(),
    snapshotInterval
  );
}
