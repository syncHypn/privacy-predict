/**
 * Contract Caller
 *
 * Handles all write operations to contracts:
 * - StateAnchor.commitRoot()
 * - PrivateToken.batchUpdateBalances()
 * - PrivateToken.processWithdrawal()
 */

import {
  type Address,
  type Hex,
  type TransactionReceipt,
  encodeFunctionData,
  parseAbi,
} from 'viem';
import type { ContractAddresses, Market } from '../types.js';
import type { ProviderManager } from './providers.js';
import { BlockchainError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ContractCaller');

// Contract ABIs (minimal for needed functions)
const STATE_ANCHOR_ABI = parseAbi([
  'function commitRoot(bytes32 newRoot, bytes32 matchId, bytes calldata teeAttestation) external',
  'function currentRoot() external view returns (bytes32)',
  'function stateVersion() external view returns (uint256)',
  'function getRootAtVersion(uint256 version) external view returns (bytes32)',
  'function isRootCommitted(bytes32 root) external view returns (bool)',
  'function teeAddress() external view returns (address)',
]);

const PRIVATE_TOKEN_ABI = parseAbi([
  'function batchUpdateBalances(address[] calldata users, bytes[] calldata newEncryptedBalances, bytes32 stateRoot) external',
  'function processWithdrawal(address user, uint256 amount, bytes calldata proof) external',
  'function getEncryptedBalance(address user) external view returns (bytes)',
  'function teeAddress() external view returns (address)',
]);

const MARKET_FACTORY_ABI = parseAbi([
  'function getMarket(bytes32 marketId) external view returns (bytes32, string, string[], uint256, uint8, bool, address)',
  'function marketExists(bytes32 marketId) external view returns (bool)',
]);

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Contract Caller class
 */
export class ContractCaller {
  private retryConfig: RetryConfig;

  constructor(
    private providerManager: ProviderManager,
    private contracts: ContractAddresses,
    private teePrivateKey: Hex,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  // ============================================================================
  // StateAnchor Functions
  // ============================================================================

  /**
   * Commit a new PMT root to StateAnchor
   */
  async commitRoot(
    newRoot: Hex,
    matchId: Hex,
    attestation: Uint8Array
  ): Promise<TransactionReceipt> {
    logger.info('Committing root', { newRoot, matchId });

    const data = encodeFunctionData({
      abi: STATE_ANCHOR_ABI,
      functionName: 'commitRoot',
      args: [newRoot, matchId, `0x${Buffer.from(attestation).toString('hex')}`],
    });

    return this.executeWithRetry(async () => {
      return this.sendTransaction(this.contracts.stateAnchor, data);
    });
  }

  /**
   * Get current root from StateAnchor
   */
  async getCurrentRoot(): Promise<Hex> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.stateAnchor,
      abi: STATE_ANCHOR_ABI,
      functionName: 'currentRoot',
    });

    return result as Hex;
  }

  /**
   * Get state version from StateAnchor
   */
  async getStateVersion(): Promise<bigint> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.stateAnchor,
      abi: STATE_ANCHOR_ABI,
      functionName: 'stateVersion',
    });

    return result as bigint;
  }

  /**
   * Get root at specific version
   */
  async getRootAtVersion(version: bigint): Promise<Hex> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.stateAnchor,
      abi: STATE_ANCHOR_ABI,
      functionName: 'getRootAtVersion',
      args: [version],
    });

    return result as Hex;
  }

  /**
   * Check if root is committed
   */
  async isRootCommitted(root: Hex): Promise<boolean> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.stateAnchor,
      abi: STATE_ANCHOR_ABI,
      functionName: 'isRootCommitted',
      args: [root],
    });

    return result as boolean;
  }

  // ============================================================================
  // PrivateToken Functions
  // ============================================================================

  /**
   * Batch update encrypted balances
   */
  async batchUpdateBalances(
    users: Address[],
    encryptedBalances: Hex[],
    stateRoot: Hex
  ): Promise<TransactionReceipt> {
    logger.info('Batch updating balances', { userCount: users.length, stateRoot });

    const data = encodeFunctionData({
      abi: PRIVATE_TOKEN_ABI,
      functionName: 'batchUpdateBalances',
      args: [users, encryptedBalances, stateRoot],
    });

    return this.executeWithRetry(async () => {
      return this.sendTransaction(this.contracts.privateToken, data);
    });
  }

  /**
   * Process a withdrawal request
   */
  async processWithdrawal(
    user: Address,
    amount: bigint,
    proof: Uint8Array
  ): Promise<TransactionReceipt> {
    logger.info('Processing withdrawal', { user });

    const data = encodeFunctionData({
      abi: PRIVATE_TOKEN_ABI,
      functionName: 'processWithdrawal',
      args: [user, amount, `0x${Buffer.from(proof).toString('hex')}`],
    });

    return this.executeWithRetry(async () => {
      return this.sendTransaction(this.contracts.privateToken, data);
    });
  }

  /**
   * Get encrypted balance for a user
   */
  async getEncryptedBalance(user: Address): Promise<Hex> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.privateToken,
      abi: PRIVATE_TOKEN_ABI,
      functionName: 'getEncryptedBalance',
      args: [user],
    });

    return result as Hex;
  }

  // ============================================================================
  // MarketFactory Functions
  // ============================================================================

  /**
   * Get market details
   */
  async getMarket(marketId: Hex): Promise<Market> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.marketFactory,
      abi: MARKET_FACTORY_ABI,
      functionName: 'getMarket',
      args: [marketId],
    }) as readonly [Hex, string, readonly string[], bigint, number, boolean, Address];

    return {
      marketId: result[0],
      question: result[1],
      outcomes: [...result[2]],
      resolutionTime: result[3],
      winningOutcome: result[4],
      resolved: result[5],
      creator: result[6],
    };
  }

  /**
   * Check if market exists
   */
  async marketExists(marketId: Hex): Promise<boolean> {
    const client = this.providerManager.getPublicClient();

    const result = await client.readContract({
      address: this.contracts.marketFactory,
      abi: MARKET_FACTORY_ABI,
      functionName: 'marketExists',
      args: [marketId],
    });

    return result as boolean;
  }

  // ============================================================================
  // Transaction Execution
  // ============================================================================

  /**
   * Send a transaction
   */
  private async sendTransaction(to: Address, data: Hex): Promise<TransactionReceipt> {
    const walletClient = this.providerManager.createWalletClient(this.teePrivateKey);
    const publicClient = this.providerManager.getPublicClient();

    // Estimate gas
    const gasEstimate = await publicClient.estimateGas({
      account: walletClient.account,
      to,
      data,
    });

    // Add 20% buffer
    const gas = (gasEstimate * 120n) / 100n;

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to,
      data,
      gas,
    });

    logger.debug('Transaction sent', { hash });

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    if (receipt.status === 'reverted') {
      throw new BlockchainError('Transaction reverted', { hash, receipt });
    }

    logger.info('Transaction confirmed', {
      hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
    });

    return receipt;
  }

  /**
   * Execute with retry and exponential backoff
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Transaction attempt failed', {
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          error: lastError.message,
        });

        if (attempt < this.retryConfig.maxRetries - 1) {
          await this.sleep(delay);
          delay = Math.min(delay * 2, this.retryConfig.maxDelayMs);
        }
      }
    }

    throw new BlockchainError(
      `Transaction failed after ${this.retryConfig.maxRetries} attempts`,
      { lastError: lastError?.message }
    );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get TEE address from contracts
   */
  async verifyTEEAddress(): Promise<{ stateAnchor: Address; privateToken: Address }> {
    const client = this.providerManager.getPublicClient();

    const [stateAnchorTEE, privateTokenTEE] = await Promise.all([
      client.readContract({
        address: this.contracts.stateAnchor,
        abi: STATE_ANCHOR_ABI,
        functionName: 'teeAddress',
      }),
      client.readContract({
        address: this.contracts.privateToken,
        abi: PRIVATE_TOKEN_ABI,
        functionName: 'teeAddress',
      }),
    ]);

    return {
      stateAnchor: stateAnchorTEE as Address,
      privateToken: privateTokenTEE as Address,
    };
  }
}

/**
 * Create a contract caller instance
 */
export function createContractCaller(
  providerManager: ProviderManager,
  contracts: ContractAddresses,
  teePrivateKey: Hex,
  retryConfig?: Partial<RetryConfig>
): ContractCaller {
  return new ContractCaller(providerManager, contracts, teePrivateKey, retryConfig);
}
