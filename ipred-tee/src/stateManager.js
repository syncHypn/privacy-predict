/**
 * State Manager for iPred TEE
 * Manages encrypted balances and pool reserves
 *
 * State is split into:
 * - Public state: Pool reserves (visible for price computation)
 * - Private state: User balances (encrypted)
 */

import { encryptBalance, decryptBalance } from './encryption.js';

/**
 * @typedef {Object} PoolReserves
 * @property {bigint} usdc - USDC reserve
 * @property {bigint} yes - YES token reserve
 * @property {bigint} no - NO token reserve
 */

/**
 * @typedef {Object} EncryptedBalanceEntry
 * @property {string} nonce
 * @property {string} ciphertext
 */

/**
 * @typedef {Object} PublicState
 * @property {Object.<string, { usdc: string, yes: string, no: string }>} pools - Pool reserves by market ID
 * @property {number} version - State version
 * @property {number} timestamp - Last update timestamp
 */

/**
 * @typedef {Object} PrivateState
 * @property {Object.<string, EncryptedBalanceEntry>} balances - Encrypted balances by "user:token" key
 * @property {string[]} processedOrders - List of processed order IDs
 * @property {number} lastProcessedBlock - Last processed block number
 * @property {number} version - State version
 */

export class StateManager {
  /** @type {Map<string, PoolReserves>} */
  #pools = new Map();

  /** @type {Map<string, bigint>} */
  #balances = new Map();

  /** @type {Set<string>} */
  #processedOrders = new Set();

  /** @type {number} */
  #version = 0;

  /** @type {number} */
  #lastProcessedBlock = 0;

  /** @type {Uint8Array} */
  #sealedKey;

  /**
   * @param {Uint8Array} sealedKey - TEE sealed key for encryption
   */
  constructor(sealedKey) {
    this.#sealedKey = sealedKey;
  }

  // ============================================================
  // Pool Management
  // ============================================================

  /**
   * Initializes a new market pool with equal reserves
   * @param {string} marketId - Market identifier
   * @param {bigint} initialLiquidity - Initial liquidity in USDC
   */
  initializePool(marketId, initialLiquidity) {
    if (this.#pools.has(marketId)) {
      throw new Error(`POOL_EXISTS: Pool for market ${marketId} already exists`);
    }

    // Start with 50/50 probability (equal reserves)
    const initialReserve = initialLiquidity;

    this.#pools.set(marketId, {
      usdc: initialReserve,
      yes: initialReserve,
      no: initialReserve,
    });
  }

  /**
   * Gets pool reserves for a market
   * @param {string} marketId
   * @returns {PoolReserves | undefined}
   */
  getPool(marketId) {
    return this.#pools.get(marketId);
  }

  /**
   * Updates pool reserves after a swap
   * @param {string} marketId
   * @param {PoolReserves} newReserves
   */
  updatePool(marketId, newReserves) {
    if (!this.#pools.has(marketId)) {
      throw new Error(`POOL_NOT_FOUND: Pool for market ${marketId} not found`);
    }
    this.#pools.set(marketId, newReserves);
  }

  /**
   * Gets indicative prices for a market (public)
   * @param {string} marketId
   * @returns {{ yes: number, no: number } | undefined}
   */
  getIndicativePrices(marketId) {
    const pool = this.#pools.get(marketId);
    if (!pool) return undefined;

    // Price = USDC / Token reserve
    // Normalized so P(YES) + P(NO) = 1
    const priceYes = Number(pool.usdc) / Number(pool.yes);
    const priceNo = Number(pool.usdc) / Number(pool.no);
    const total = priceYes + priceNo;

    return {
      yes: priceYes / total,
      no: priceNo / total,
    };
  }

  // ============================================================
  // Balance Management
  // ============================================================

  /**
   * Gets the balance key for a user and token
   * @param {string} user - User address
   * @param {string} token - Token type (cUSDC, cYES:marketId, cNO:marketId)
   * @returns {string}
   */
  #getBalanceKey(user, token) {
    return `${user.toLowerCase()}:${token}`;
  }

  /**
   * Gets a user's balance for a token
   * @param {string} user - User address
   * @param {string} token - Token type
   * @returns {bigint}
   */
  getBalance(user, token) {
    const key = this.#getBalanceKey(user, token);
    return this.#balances.get(key) ?? 0n;
  }

  /**
   * Sets a user's balance for a token
   * @param {string} user - User address
   * @param {string} token - Token type
   * @param {bigint} amount - New balance
   */
  setBalance(user, token, amount) {
    if (amount < 0n) {
      throw new Error('NEGATIVE_BALANCE: Balance cannot be negative');
    }
    const key = this.#getBalanceKey(user, token);
    this.#balances.set(key, amount);
  }

  /**
   * Adds to a user's balance
   * @param {string} user
   * @param {string} token
   * @param {bigint} amount
   */
  addBalance(user, token, amount) {
    const current = this.getBalance(user, token);
    this.setBalance(user, token, current + amount);
  }

  /**
   * Subtracts from a user's balance
   * @param {string} user
   * @param {string} token
   * @param {bigint} amount
   * @throws If insufficient balance
   */
  subtractBalance(user, token, amount) {
    const current = this.getBalance(user, token);
    if (current < amount) {
      throw new Error(`INSUFFICIENT_BALANCE: ${user} has ${current} ${token}, needs ${amount}`);
    }
    this.setBalance(user, token, current - amount);
  }

  /**
   * Transfers tokens between users
   * @param {string} from
   * @param {string} to
   * @param {string} token
   * @param {bigint} amount
   */
  transfer(from, to, token, amount) {
    this.subtractBalance(from, token, amount);
    this.addBalance(to, token, amount);
  }

  // ============================================================
  // Order Processing
  // ============================================================

  /**
   * Marks an order as processed
   * @param {string} orderId
   */
  markOrderProcessed(orderId) {
    this.#processedOrders.add(orderId);
  }

  /**
   * Checks if an order has been processed
   * @param {string} orderId
   * @returns {boolean}
   */
  isOrderProcessed(orderId) {
    return this.#processedOrders.has(orderId);
  }

  /**
   * Sets the last processed block number
   * @param {number} blockNumber
   */
  setLastProcessedBlock(blockNumber) {
    this.#lastProcessedBlock = blockNumber;
  }

  /**
   * Gets the last processed block number
   * @returns {number}
   */
  getLastProcessedBlock() {
    return this.#lastProcessedBlock;
  }

  // ============================================================
  // State Serialization (Split State)
  // ============================================================

  /**
   * Exports public state (pools only - for Arweave)
   * @returns {PublicState}
   */
  exportPublicState() {
    const pools = {};
    for (const [marketId, reserves] of this.#pools) {
      pools[marketId] = {
        usdc: reserves.usdc.toString(),
        yes: reserves.yes.toString(),
        no: reserves.no.toString(),
      };
    }

    return {
      pools,
      version: this.#version,
      timestamp: Date.now(),
    };
  }

  /**
   * Exports private state (encrypted balances)
   * @returns {PrivateState}
   */
  exportPrivateState() {
    const balances = {};
    for (const [key, value] of this.#balances) {
      // Encrypt each balance before export
      const encrypted = encryptBalance(value, this.#sealedKey);
      balances[key] = encrypted;
    }

    return {
      balances,
      processedOrders: Array.from(this.#processedOrders),
      lastProcessedBlock: this.#lastProcessedBlock,
      version: this.#version,
    };
  }

  /**
   * Imports public state from Arweave
   * @param {PublicState} publicState
   */
  importPublicState(publicState) {
    this.#pools.clear();
    for (const [marketId, reserves] of Object.entries(publicState.pools)) {
      this.#pools.set(marketId, {
        usdc: BigInt(reserves.usdc),
        yes: BigInt(reserves.yes),
        no: BigInt(reserves.no),
      });
    }
    this.#version = publicState.version;
  }

  /**
   * Imports private state from Arweave (after decryption)
   * @param {PrivateState} privateState
   */
  importPrivateState(privateState) {
    this.#balances.clear();
    for (const [key, encrypted] of Object.entries(privateState.balances)) {
      // Decrypt each balance
      const value = decryptBalance(encrypted, this.#sealedKey);
      this.#balances.set(key, value);
    }

    this.#processedOrders = new Set(privateState.processedOrders);
    this.#lastProcessedBlock = privateState.lastProcessedBlock;
    this.#version = privateState.version;
  }

  /**
   * Increments state version
   */
  incrementVersion() {
    this.#version++;
  }

  /**
   * Gets current state version
   * @returns {number}
   */
  getVersion() {
    return this.#version;
  }

  // ============================================================
  // State Root Computation
  // ============================================================

  /**
   * Computes state root hash for on-chain anchoring
   * @returns {string} Hex-encoded state root
   */
  computeStateRoot() {
    // Combine public and private state hashes
    const publicJson = JSON.stringify(this.exportPublicState());
    const privateJson = JSON.stringify(this.exportPrivateState());

    // Simple hash combination (in production, use proper Merkle tree)
    const combined = publicJson + '|' + privateJson;
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);

    // Use a simple hash for MVP (replace with proper crypto hash in production)
    let hash = 0n;
    for (let i = 0; i < data.length; i++) {
      hash = (hash * 31n + BigInt(data[i])) % (2n ** 256n);
    }

    return '0x' + hash.toString(16).padStart(64, '0');
  }

  // ============================================================
  // Balance Export for On-Chain Updates
  // ============================================================

  /**
   * Gets all users with balances (for batch update)
   * @returns {string[]}
   */
  getAllUsers() {
    const users = new Set();
    for (const key of this.#balances.keys()) {
      const user = key.split(':')[0];
      users.add(user);
    }
    return Array.from(users);
  }

  /**
   * Gets all balance entries for a user (encrypted for on-chain)
   * @param {string} user
   * @returns {Object.<string, EncryptedBalanceEntry>}
   */
  getUserEncryptedBalances(user) {
    const result = {};
    const prefix = user.toLowerCase() + ':';

    for (const [key, value] of this.#balances) {
      if (key.startsWith(prefix)) {
        const token = key.substring(prefix.length);
        result[token] = encryptBalance(value, this.#sealedKey);
      }
    }

    return result;
  }

  /**
   * Prepares batch update data for PrivateToken contract
   * @returns {{ users: string[], encryptedBalances: string[] }}
   */
  prepareBatchUpdate() {
    const users = this.getAllUsers();
    const encryptedBalances = users.map(user => {
      const balances = this.getUserEncryptedBalances(user);
      return JSON.stringify(balances);
    });

    return { users, encryptedBalances };
  }
}

export default StateManager;
