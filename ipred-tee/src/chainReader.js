/**
 * Chain Reader for iPred TEE
 * Reads orders from OrderQueue contract on Arbitrum Sepolia
 */

import { ethers } from 'ethers';
import { decryptOrder, hexToBytes } from './encryption.js';

// Contract ABIs (minimal interfaces needed for reading)
const ORDER_QUEUE_ABI = [
  'function getOrder(bytes32 orderId) external view returns (tuple(bytes32 orderId, bytes32 marketId, address user, bytes encryptedPayload, uint256 timestamp))',
  'function getMarketOrders(bytes32 marketId) external view returns (bytes32[])',
  'function getUserOrders(address user) external view returns (bytes32[])',
  'function isOrderCancelled(bytes32 orderId) external view returns (bool)',
  'event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp)',
  'event OrderCancelled(bytes32 indexed orderId, address indexed user)',
];

const MARKET_FACTORY_ABI = [
  'function marketExists(bytes32 marketId) external view returns (bool)',
  'function isMarketResolved(bytes32 marketId) external view returns (bool)',
  'function getMarket(bytes32 marketId) external view returns (tuple(bytes32 marketId, string question, uint256 resolutionTime, bool resolved, bool outcome, address cYesToken, address cNoToken))',
  'event MarketCreated(bytes32 indexed marketId, string question, uint256 resolutionTime)',
  'event MarketResolved(bytes32 indexed marketId, bool outcome)',
];

const PRIVATE_TOKEN_ABI = [
  'function getEncryptedBalance(address user) external view returns (bytes)',
  'function totalDeposited() external view returns (uint256)',
  'event Deposit(address indexed user, uint256 amount, bytes32 commitment)',
  'event WithdrawalRequested(address indexed user, bytes32 commitmentHash)',
];

/**
 * @typedef {Object} RawOrder
 * @property {string} orderId
 * @property {string} marketId
 * @property {string} user
 * @property {string} encryptedPayload - Hex-encoded encrypted payload
 * @property {number} timestamp
 */

/**
 * @typedef {Object} DecryptedOrder
 * @property {string} orderId
 * @property {string} marketId
 * @property {string} user
 * @property {'BUY' | 'SELL'} side
 * @property {number} outcomeIndex - 0 for YES, 1 for NO
 * @property {bigint} amount
 * @property {number} nonce
 * @property {number} timestamp
 */

/**
 * @typedef {Object} DepositEvent
 * @property {string} user
 * @property {bigint} amount
 * @property {string} commitment
 * @property {number} blockNumber
 */

export class ChainReader {
  /** @type {ethers.Provider} */
  #provider;

  /** @type {ethers.Contract} */
  #orderQueue;

  /** @type {ethers.Contract} */
  #marketFactory;

  /** @type {ethers.Contract} */
  #privateToken;

  /** @type {Uint8Array} */
  #teeSecretKey;

  /**
   * @param {Object} config
   * @param {string} config.rpcUrl - RPC endpoint URL
   * @param {string} config.orderQueueAddress
   * @param {string} config.marketFactoryAddress
   * @param {string} config.privateTokenAddress
   * @param {Uint8Array} config.teeSecretKey - TEE's secret key for decrypting orders
   */
  constructor(config) {
    this.#provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.#orderQueue = new ethers.Contract(config.orderQueueAddress, ORDER_QUEUE_ABI, this.#provider);
    this.#marketFactory = new ethers.Contract(config.marketFactoryAddress, MARKET_FACTORY_ABI, this.#provider);
    this.#privateToken = new ethers.Contract(config.privateTokenAddress, PRIVATE_TOKEN_ABI, this.#provider);
    this.#teeSecretKey = config.teeSecretKey;
  }

  // ============================================================
  // Order Reading
  // ============================================================

  /**
   * Gets all pending orders for a market
   * @param {string} marketId
   * @returns {Promise<RawOrder[]>}
   */
  async getMarketOrders(marketId) {
    const orderIds = await this.#orderQueue.getMarketOrders(marketId);
    const orders = [];

    for (const orderId of orderIds) {
      const isCancelled = await this.#orderQueue.isOrderCancelled(orderId);
      if (isCancelled) continue;

      const order = await this.#orderQueue.getOrder(orderId);
      orders.push({
        orderId: order.orderId,
        marketId: order.marketId,
        user: order.user,
        encryptedPayload: order.encryptedPayload,
        timestamp: Number(order.timestamp),
      });
    }

    return orders;
  }

  /**
   * Gets orders for a specific user
   * @param {string} userAddress
   * @returns {Promise<RawOrder[]>}
   */
  async getUserOrders(userAddress) {
    const orderIds = await this.#orderQueue.getUserOrders(userAddress);
    const orders = [];

    for (const orderId of orderIds) {
      const isCancelled = await this.#orderQueue.isOrderCancelled(orderId);
      if (isCancelled) continue;

      const order = await this.#orderQueue.getOrder(orderId);
      orders.push({
        orderId: order.orderId,
        marketId: order.marketId,
        user: order.user,
        encryptedPayload: order.encryptedPayload,
        timestamp: Number(order.timestamp),
      });
    }

    return orders;
  }

  /**
   * Decrypts a raw order using TEE's secret key
   * @param {RawOrder} rawOrder
   * @returns {DecryptedOrder}
   */
  decryptOrderPayload(rawOrder) {
    // Parse the encrypted payload
    // Expected format: { nonce, ciphertext, userPublicKey }
    const payloadHex = rawOrder.encryptedPayload.startsWith('0x')
      ? rawOrder.encryptedPayload.slice(2)
      : rawOrder.encryptedPayload;

    // Try to parse as JSON first (if stored as JSON string in bytes)
    let encrypted;
    try {
      const jsonStr = Buffer.from(payloadHex, 'hex').toString('utf8');
      encrypted = JSON.parse(jsonStr);
    } catch {
      // If not JSON, assume it's a concatenated binary format:
      // 24 bytes nonce + 32 bytes userPublicKey + rest is ciphertext
      const bytes = hexToBytes(rawOrder.encryptedPayload);
      encrypted = {
        nonce: '0x' + Buffer.from(bytes.slice(0, 24)).toString('hex'),
        userPublicKey: '0x' + Buffer.from(bytes.slice(24, 56)).toString('hex'),
        ciphertext: '0x' + Buffer.from(bytes.slice(56)).toString('hex'),
      };
    }

    const orderPayload = decryptOrder(encrypted, this.#teeSecretKey);

    return {
      orderId: rawOrder.orderId,
      marketId: rawOrder.marketId,
      user: rawOrder.user,
      side: orderPayload.side,
      outcomeIndex: orderPayload.outcomeIndex,
      amount: BigInt(orderPayload.amount),
      nonce: orderPayload.nonce,
      timestamp: rawOrder.timestamp,
    };
  }

  /**
   * Gets and decrypts all pending orders for a market
   * @param {string} marketId
   * @returns {Promise<DecryptedOrder[]>}
   */
  async getDecryptedMarketOrders(marketId) {
    const rawOrders = await this.getMarketOrders(marketId);
    return rawOrders.map(order => this.decryptOrderPayload(order));
  }

  // ============================================================
  // Market Reading
  // ============================================================

  /**
   * Checks if a market exists
   * @param {string} marketId
   * @returns {Promise<boolean>}
   */
  async marketExists(marketId) {
    return await this.#marketFactory.marketExists(marketId);
  }

  /**
   * Checks if a market is resolved
   * @param {string} marketId
   * @returns {Promise<boolean>}
   */
  async isMarketResolved(marketId) {
    return await this.#marketFactory.isMarketResolved(marketId);
  }

  /**
   * Gets market details
   * @param {string} marketId
   * @returns {Promise<{ marketId: string, question: string, resolutionTime: number, resolved: boolean, outcome: boolean }>}
   */
  async getMarket(marketId) {
    const market = await this.#marketFactory.getMarket(marketId);
    return {
      marketId: market.marketId,
      question: market.question,
      resolutionTime: Number(market.resolutionTime),
      resolved: market.resolved,
      outcome: market.outcome,
    };
  }

  // ============================================================
  // Balance Reading
  // ============================================================

  /**
   * Gets the encrypted balance for a user from PrivateToken contract
   * @param {string} userAddress
   * @returns {Promise<Object|null>} Parsed encrypted balances object, or null if empty
   */
  async getEncryptedBalance(userAddress) {
    const encryptedBytes = await this.#privateToken.getEncryptedBalance(userAddress);
    if (!encryptedBytes || encryptedBytes === '0x' || encryptedBytes.length <= 2) {
      return null;
    }
    const jsonStr = ethers.toUtf8String(encryptedBytes);
    return JSON.parse(jsonStr);
  }

  // ============================================================
  // Deposit Event Reading
  // ============================================================

  /**
   * Gets deposit events from a block range
   * @param {number} fromBlock
   * @param {number} toBlock
   * @returns {Promise<DepositEvent[]>}
   */
  async getDeposits(fromBlock, toBlock) {
    const filter = this.#privateToken.filters.Deposit();
    const events = await this.#privateToken.queryFilter(filter, fromBlock, toBlock);

    return events.map(event => ({
      user: event.args.user,
      amount: event.args.amount,
      commitment: event.args.commitment,
      blockNumber: event.blockNumber,
    }));
  }

  /**
   * Gets the current block number
   * @returns {Promise<number>}
   */
  async getCurrentBlock() {
    return await this.#provider.getBlockNumber();
  }

  /**
   * Gets total deposited amount in PrivateToken
   * @returns {Promise<bigint>}
   */
  async getTotalDeposited() {
    return await this.#privateToken.totalDeposited();
  }

  // ============================================================
  // Event Fetching (for batch processing)
  // ============================================================

  /**
   * Gets new orders submitted since a block
   * @param {string} marketId
   * @param {number} fromBlock
   * @returns {Promise<RawOrder[]>}
   */
  async getNewOrders(marketId, fromBlock) {
    const filter = this.#orderQueue.filters.OrderSubmitted(null, marketId);
    const toBlock = await this.getCurrentBlock();
    const events = await this.#orderQueue.queryFilter(filter, fromBlock, toBlock);

    const orders = [];
    for (const event of events) {
      const isCancelled = await this.#orderQueue.isOrderCancelled(event.args.orderId);
      if (!isCancelled) {
        orders.push({
          orderId: event.args.orderId,
          marketId: event.args.marketId,
          user: event.args.user,
          encryptedPayload: event.args.encryptedPayload,
          timestamp: Number(event.args.timestamp),
        });
      }
    }

    return orders;
  }

  /**
   * Gets cancelled order IDs since a block
   * @param {number} fromBlock
   * @returns {Promise<string[]>}
   */
  async getCancelledOrders(fromBlock) {
    const filter = this.#orderQueue.filters.OrderCancelled();
    const toBlock = await this.getCurrentBlock();
    const events = await this.#orderQueue.queryFilter(filter, fromBlock, toBlock);

    return events.map(event => event.args.orderId);
  }

  /**
   * Gets market resolution events since a block
   * @param {number} fromBlock
   * @returns {Promise<Array<{ marketId: string, outcome: boolean }>>}
   */
  async getMarketResolutions(fromBlock) {
    const filter = this.#marketFactory.filters.MarketResolved();
    const toBlock = await this.getCurrentBlock();
    const events = await this.#marketFactory.queryFilter(filter, fromBlock, toBlock);

    return events.map(event => ({
      marketId: event.args.marketId,
      outcome: event.args.outcome,
    }));
  }
}

export default ChainReader;
