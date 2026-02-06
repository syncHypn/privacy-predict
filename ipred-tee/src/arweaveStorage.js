/**
 * Arweave Storage for iPred TEE
 * Implements split state architecture:
 * - Public state: Pool reserves (plaintext JSON)
 * - Private state: Encrypted balances (NaCl secretbox)
 */

import Arweave from 'arweave';
import { encryptState, decryptState } from './encryption.js';

/**
 * @typedef {Object} ArweaveConfig
 * @property {string} [host='arweave.net']
 * @property {number} [port=443]
 * @property {string} [protocol='https']
 */

/**
 * @typedef {Object} StateMetadata
 * @property {string} marketId
 * @property {string} stateRoot
 * @property {number} version
 * @property {number} timestamp
 * @property {string} publicStateTxId
 * @property {string} privateStateTxId
 */

export class ArweaveStorage {
  /** @type {Arweave} */
  #arweave;

  /** @type {Object} */
  #wallet;

  /** @type {Uint8Array} */
  #sealedKey;

  /**
   * @param {Object} wallet - Arweave JWK wallet
   * @param {ArweaveConfig} [config]
   * @param {Uint8Array} [sealedKey] - TEE sealed key for encryption
   */
  constructor(wallet, config = {}, sealedKey = null) {
    this.#arweave = Arweave.init({
      host: config.host || 'arweave.net',
      port: config.port || 443,
      protocol: config.protocol || 'https',
    });
    this.#wallet = wallet;
    this.#sealedKey = sealedKey;
  }

  /**
   * Sets the sealed key for encryption
   * @param {Uint8Array} sealedKey
   */
  setSealedKey(sealedKey) {
    this.#sealedKey = sealedKey;
  }

  // ============================================================
  // Upload Operations
  // ============================================================

  /**
   * Uploads public state to Arweave
   * @param {Object} publicState - Public state object (pools)
   * @param {string} marketId
   * @returns {Promise<string>} Transaction ID
   */
  async uploadPublicState(publicState, marketId) {
    const data = JSON.stringify(publicState, null, 2);
    const tx = await this.#arweave.createTransaction({ data }, this.#wallet);

    // Add tags for querying
    tx.addTag('Content-Type', 'application/json');
    tx.addTag('App-Name', 'iPred-TEE');
    tx.addTag('Type', 'public-state');
    tx.addTag('Storage-Type', 'public');
    tx.addTag('Market-Id', marketId);
    tx.addTag('Version', publicState.version.toString());
    tx.addTag('Timestamp', Date.now().toString());

    await this.#arweave.transactions.sign(tx, this.#wallet);
    const response = await this.#arweave.transactions.post(tx);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`ARWEAVE_UPLOAD_FAILED: ${response.statusText}`);
    }

    return tx.id;
  }

  /**
   * Uploads private state to Arweave (encrypted)
   * @param {Object} privateState - Private state object (balances)
   * @param {string} marketId
   * @param {string} publicStateTxId - Link to corresponding public state
   * @returns {Promise<string>} Transaction ID
   */
  async uploadPrivateState(privateState, marketId, publicStateTxId) {
    if (!this.#sealedKey) {
      throw new Error('SEALED_KEY_NOT_SET: Cannot encrypt without sealed key');
    }

    const encrypted = encryptState(privateState, this.#sealedKey);
    const tx = await this.#arweave.createTransaction({ data: encrypted }, this.#wallet);

    // Add tags for querying
    tx.addTag('Content-Type', 'application/octet-stream');
    tx.addTag('App-Name', 'iPred-TEE');
    tx.addTag('Type', 'private-state');
    tx.addTag('Storage-Type', 'private');
    tx.addTag('Market-Id', marketId);
    tx.addTag('Version', privateState.version.toString());
    tx.addTag('Public-State-Tx', publicStateTxId);
    tx.addTag('Timestamp', Date.now().toString());

    await this.#arweave.transactions.sign(tx, this.#wallet);
    const response = await this.#arweave.transactions.post(tx);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`ARWEAVE_UPLOAD_FAILED: ${response.statusText}`);
    }

    return tx.id;
  }

  /**
   * Uploads both public and private state atomically
   * @param {Object} publicState
   * @param {Object} privateState
   * @param {string} marketId
   * @returns {Promise<StateMetadata>}
   */
  async uploadSplitState(publicState, privateState, marketId) {
    // Compute state root
    const stateRoot = this.#computeStateRoot(publicState, privateState);

    // Upload public state first
    const publicStateTxId = await this.uploadPublicState(publicState, marketId);

    // Upload private state with link to public
    const privateStateTxId = await this.uploadPrivateState(privateState, marketId, publicStateTxId);

    return {
      marketId,
      stateRoot,
      version: publicState.version,
      timestamp: Date.now(),
      publicStateTxId,
      privateStateTxId,
    };
  }

  // ============================================================
  // Download Operations
  // ============================================================

  /**
   * Downloads public state from Arweave
   * @param {string} txId - Transaction ID
   * @returns {Promise<Object>} Public state object
   */
  async downloadPublicState(txId) {
    const data = await this.#arweave.transactions.getData(txId, { decode: true, string: true });
    return JSON.parse(data);
  }

  /**
   * Downloads and decrypts private state from Arweave
   * @param {string} txId - Transaction ID
   * @returns {Promise<Object>} Private state object
   */
  async downloadPrivateState(txId) {
    if (!this.#sealedKey) {
      throw new Error('SEALED_KEY_NOT_SET: Cannot decrypt without sealed key');
    }

    const encrypted = await this.#arweave.transactions.getData(txId, { decode: true, string: true });
    return decryptState(encrypted, this.#sealedKey);
  }

  /**
   * Downloads state by transaction ID (auto-detects type)
   * @param {string} txId
   * @returns {Promise<Object>}
   */
  async downloadState(txId) {
    const tags = await this.#getTransactionTags(txId);
    const storageType = tags['Storage-Type'];

    if (storageType === 'public') {
      return this.downloadPublicState(txId);
    } else if (storageType === 'private') {
      return this.downloadPrivateState(txId);
    } else {
      throw new Error(`UNKNOWN_STATE_TYPE: ${storageType}`);
    }
  }

  // ============================================================
  // Query Operations (GraphQL)
  // ============================================================

  /**
   * Finds the latest public state for a market
   * @param {string} marketId
   * @returns {Promise<{ txId: string, version: number } | null>}
   */
  async findLatestPublicState(marketId) {
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["iPred-TEE"] },
            { name: "Type", values: ["public-state"] },
            { name: "Market-Id", values: ["${marketId}"] }
          ],
          sort: HEIGHT_DESC,
          first: 1
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

    const response = await this.#arweave.api.post('graphql', { query });
    const edges = response.data?.data?.transactions?.edges;

    if (!edges || edges.length === 0) {
      return null;
    }

    const node = edges[0].node;
    const versionTag = node.tags.find(t => t.name === 'Version');

    return {
      txId: node.id,
      version: versionTag ? parseInt(versionTag.value) : 0,
    };
  }

  /**
   * Finds the private state corresponding to a public state
   * @param {string} publicStateTxId
   * @returns {Promise<string | null>} Private state transaction ID
   */
  async findPrivateStateForPublic(publicStateTxId) {
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["iPred-TEE"] },
            { name: "Type", values: ["private-state"] },
            { name: "Public-State-Tx", values: ["${publicStateTxId}"] }
          ],
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const response = await this.#arweave.api.post('graphql', { query });
    const edges = response.data?.data?.transactions?.edges;

    if (!edges || edges.length === 0) {
      return null;
    }

    return edges[0].node.id;
  }

  /**
   * Loads the latest full state for a market
   * @param {string} marketId
   * @returns {Promise<{ publicState: Object, privateState: Object, metadata: StateMetadata } | null>}
   */
  async loadLatestState(marketId) {
    // Find latest public state
    const latest = await this.findLatestPublicState(marketId);
    if (!latest) {
      return null;
    }

    // Find corresponding private state
    const privateTxId = await this.findPrivateStateForPublic(latest.txId);
    if (!privateTxId) {
      throw new Error(`PRIVATE_STATE_MISSING: No private state for public ${latest.txId}`);
    }

    // Download both states
    const publicState = await this.downloadPublicState(latest.txId);
    const privateState = await this.downloadPrivateState(privateTxId);

    return {
      publicState,
      privateState,
      metadata: {
        marketId,
        stateRoot: this.#computeStateRoot(publicState, privateState),
        version: latest.version,
        timestamp: publicState.timestamp || Date.now(),
        publicStateTxId: latest.txId,
        privateStateTxId: privateTxId,
      },
    };
  }

  /**
   * Gets state history for a market
   * @param {string} marketId
   * @param {number} [limit=10]
   * @returns {Promise<Array<{ txId: string, version: number, timestamp: number }>>}
   */
  async getStateHistory(marketId, limit = 10) {
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["iPred-TEE"] },
            { name: "Type", values: ["public-state"] },
            { name: "Market-Id", values: ["${marketId}"] }
          ],
          sort: HEIGHT_DESC,
          first: ${limit}
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

    const response = await this.#arweave.api.post('graphql', { query });
    const edges = response.data?.data?.transactions?.edges || [];

    return edges.map(edge => {
      const tags = Object.fromEntries(edge.node.tags.map(t => [t.name, t.value]));
      return {
        txId: edge.node.id,
        version: parseInt(tags.Version || '0'),
        timestamp: parseInt(tags.Timestamp || '0'),
      };
    });
  }

  // ============================================================
  // Utility Functions
  // ============================================================

  /**
   * Gets transaction tags
   * @param {string} txId
   * @returns {Promise<Object.<string, string>>}
   */
  async #getTransactionTags(txId) {
    const tx = await this.#arweave.transactions.get(txId);
    const tags = {};

    tx.get('tags').forEach(tag => {
      const key = tag.get('name', { decode: true, string: true });
      const value = tag.get('value', { decode: true, string: true });
      tags[key] = value;
    });

    return tags;
  }

  /**
   * Computes state root from public and private state
   * @param {Object} publicState
   * @param {Object} privateState
   * @returns {string} Hex-encoded state root
   */
  #computeStateRoot(publicState, privateState) {
    const combined = JSON.stringify(publicState) + '|' + JSON.stringify(privateState);
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);

    // Simple hash for MVP
    let hash = 0n;
    for (let i = 0; i < data.length; i++) {
      hash = (hash * 31n + BigInt(data[i])) % (2n ** 256n);
    }

    return '0x' + hash.toString(16).padStart(64, '0');
  }

  /**
   * Gets the wallet address
   * @returns {Promise<string>}
   */
  async getAddress() {
    return await this.#arweave.wallets.jwkToAddress(this.#wallet);
  }

  /**
   * Gets the wallet balance
   * @returns {Promise<string>} Balance in AR
   */
  async getBalance() {
    const address = await this.getAddress();
    const winston = await this.#arweave.wallets.getBalance(address);
    return this.#arweave.ar.winstonToAr(winston);
  }

  /**
   * Waits for a transaction to be confirmed
   * @param {string} txId
   * @param {number} [maxAttempts=30]
   * @returns {Promise<{ confirmed: boolean, confirmations: number }>}
   */
  async waitForConfirmation(txId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.#arweave.transactions.getStatus(txId);
        if (status.confirmed) {
          return {
            confirmed: true,
            confirmations: status.confirmed.number_of_confirmations || 0,
          };
        }
      } catch {
        // Transaction not yet visible
      }

      // Wait 10 seconds between attempts
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    return { confirmed: false, confirmations: 0 };
  }
}

export default ArweaveStorage;
