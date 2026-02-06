/**
 * Chain Writer for iPred TEE
 * Submits balance updates and state commitments to contracts
 */

import { ethers } from 'ethers';

// Contract ABIs for write operations
const PRIVATE_TOKEN_ABI = [
  'function batchUpdateBalances(address[] calldata users, bytes[] calldata newEncryptedBalances, bytes32 stateRoot) external',
  'function processWithdrawal(address user, uint256 amount, bytes calldata proof) external',
];

const STATE_ANCHOR_ABI = [
  'function commitRoot(bytes32 newRoot, bytes32 matchId, bytes calldata teeAttestation) external',
];

const MARKET_FACTORY_ABI = [
  'function resolveMarket(bytes32 marketId, bool outcome) external',
];

/**
 * @typedef {Object} BatchUpdateResult
 * @property {string} txHash
 * @property {number} gasUsed
 * @property {number} usersUpdated
 */

/**
 * @typedef {Object} CallbackData
 * @property {string[]} users - User addresses to update
 * @property {string[]} encryptedBalances - New encrypted balances (as hex strings)
 * @property {string} stateRoot - New state root hash
 * @property {string} matchId - Batch/match identifier
 * @property {string} attestation - TEE attestation
 */

export class ChainWriter {
  /** @type {ethers.Wallet} */
  #wallet;

  /** @type {ethers.Contract} */
  #privateToken;

  /** @type {ethers.Contract} */
  #stateAnchor;

  /** @type {ethers.Contract} */
  #marketFactory;

  /**
   * @param {Object} config
   * @param {string} config.rpcUrl - RPC endpoint URL
   * @param {string} config.privateKey - TEE's private key for signing transactions
   * @param {string} config.privateTokenAddress
   * @param {string} config.stateAnchorAddress
   * @param {string} config.marketFactoryAddress
   */
  constructor(config) {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.#wallet = new ethers.Wallet(config.privateKey, provider);

    this.#privateToken = new ethers.Contract(
      config.privateTokenAddress,
      PRIVATE_TOKEN_ABI,
      this.#wallet
    );
    this.#stateAnchor = new ethers.Contract(
      config.stateAnchorAddress,
      STATE_ANCHOR_ABI,
      this.#wallet
    );
    this.#marketFactory = new ethers.Contract(
      config.marketFactoryAddress,
      MARKET_FACTORY_ABI,
      this.#wallet
    );
  }

  // ============================================================
  // Balance Updates
  // ============================================================

  /**
   * Submits batch balance updates to PrivateToken contract
   * @param {string[]} users - Array of user addresses
   * @param {string[]} encryptedBalances - Array of encrypted balance hex strings
   * @param {string} stateRoot - State root hash
   * @returns {Promise<BatchUpdateResult>}
   */
  async batchUpdateBalances(users, encryptedBalances, stateRoot) {
    if (users.length !== encryptedBalances.length) {
      throw new Error('INVALID_INPUT: users and encryptedBalances must have same length');
    }

    if (users.length === 0) {
      return { txHash: '', gasUsed: 0, usersUpdated: 0 };
    }

    // Convert string balances to bytes
    const balanceBytes = encryptedBalances.map(balance =>
      ethers.toUtf8Bytes(balance)
    );

    const tx = await this.#privateToken.batchUpdateBalances(
      users,
      balanceBytes,
      stateRoot
    );

    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gasUsed: Number(receipt.gasUsed),
      usersUpdated: users.length,
    };
  }

  // ============================================================
  // State Commitment
  // ============================================================

  /**
   * Commits a new state root to StateAnchor contract
   * @param {string} newRoot - New state root hash
   * @param {string} matchId - Match/batch identifier
   * @param {string} attestation - TEE attestation (hex)
   * @returns {Promise<{ txHash: string, gasUsed: number }>}
   */
  async commitStateRoot(newRoot, matchId, attestation) {
    const attestationBytes = ethers.toUtf8Bytes(attestation);

    const tx = await this.#stateAnchor.commitRoot(newRoot, matchId, attestationBytes);
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gasUsed: Number(receipt.gasUsed),
    };
  }

  // ============================================================
  // Withdrawal Processing
  // ============================================================

  /**
   * Processes a verified withdrawal
   * @param {string} user - User address
   * @param {bigint} amount - Withdrawal amount
   * @param {string} proof - Withdrawal proof (hex)
   * @returns {Promise<{ txHash: string, gasUsed: number }>}
   */
  async processWithdrawal(user, amount, proof) {
    const proofBytes = ethers.toUtf8Bytes(proof);

    const tx = await this.#privateToken.processWithdrawal(user, amount, proofBytes);
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gasUsed: Number(receipt.gasUsed),
    };
  }

  // ============================================================
  // Market Resolution (Oracle)
  // ============================================================

  /**
   * Resolves a market (called when oracle determines outcome)
   * @param {string} marketId
   * @param {boolean} outcome - true = YES wins, false = NO wins
   * @returns {Promise<{ txHash: string, gasUsed: number }>}
   */
  async resolveMarket(marketId, outcome) {
    const tx = await this.#marketFactory.resolveMarket(marketId, outcome);
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gasUsed: Number(receipt.gasUsed),
    };
  }

  // ============================================================
  // Full Callback Submission
  // ============================================================

  /**
   * Submits all callback data from a TEE batch run
   * @param {CallbackData} callbackData
   * @returns {Promise<{ balanceUpdate: BatchUpdateResult, stateCommit: { txHash: string, gasUsed: number } }>}
   */
  async submitCallback(callbackData) {
    // First commit the state root
    const stateCommit = await this.commitStateRoot(
      callbackData.stateRoot,
      callbackData.matchId,
      callbackData.attestation
    );

    // Then update balances
    const balanceUpdate = await this.batchUpdateBalances(
      callbackData.users,
      callbackData.encryptedBalances,
      callbackData.stateRoot
    );

    return { balanceUpdate, stateCommit };
  }

  // ============================================================
  // Gas Estimation
  // ============================================================

  /**
   * Estimates gas for batch update
   * @param {string[]} users
   * @param {string[]} encryptedBalances
   * @param {string} stateRoot
   * @returns {Promise<bigint>}
   */
  async estimateBatchUpdateGas(users, encryptedBalances, stateRoot) {
    const balanceBytes = encryptedBalances.map(balance =>
      ethers.toUtf8Bytes(balance)
    );

    return await this.#privateToken.batchUpdateBalances.estimateGas(
      users,
      balanceBytes,
      stateRoot
    );
  }

  /**
   * Estimates gas for state commit
   * @param {string} newRoot
   * @param {string} matchId
   * @param {string} attestation
   * @returns {Promise<bigint>}
   */
  async estimateCommitRootGas(newRoot, matchId, attestation) {
    const attestationBytes = ethers.toUtf8Bytes(attestation);

    return await this.#stateAnchor.commitRoot.estimateGas(
      newRoot,
      matchId,
      attestationBytes
    );
  }

  // ============================================================
  // Utility
  // ============================================================

  /**
   * Gets the TEE wallet address
   * @returns {string}
   */
  getAddress() {
    return this.#wallet.address;
  }

  /**
   * Gets the current nonce for the TEE wallet
   * @returns {Promise<number>}
   */
  async getNonce() {
    return await this.#wallet.getNonce();
  }

  /**
   * Gets the current balance of the TEE wallet (for gas)
   * @returns {Promise<bigint>}
   */
  async getBalance() {
    return await this.#wallet.provider.getBalance(this.#wallet.address);
  }
}

/**
 * Generates callback data for iExec output
 * This is written to IEXEC_OUT for the relayer to submit
 * @param {Object} params
 * @param {string[]} params.users
 * @param {string[]} params.encryptedBalances
 * @param {string} params.stateRoot
 * @param {string} params.matchId
 * @returns {CallbackData}
 */
export function generateCallbackData({ users, encryptedBalances, stateRoot, matchId, withdrawals = [] }) {
  // Generate a simple attestation (in production, this would be SGX attestation)
  const attestation = `TEE_ATTESTATION:${matchId}:${Date.now()}`;

  return {
    users,
    encryptedBalances,
    stateRoot,
    matchId,
    attestation,
    withdrawals,
  };
}

export default ChainWriter;
