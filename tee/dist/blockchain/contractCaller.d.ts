/**
 * Contract Caller
 *
 * Handles all write operations to contracts:
 * - StateAnchor.commitRoot()
 * - PrivateToken.batchUpdateBalances()
 * - PrivateToken.processWithdrawal()
 */
import { type Address, type Hex, type TransactionReceipt } from 'viem';
import type { ContractAddresses, Market } from '../types.js';
import type { ProviderManager } from './providers.js';
/**
 * Retry configuration
 */
interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
}
/**
 * Contract Caller class
 */
export declare class ContractCaller {
    private providerManager;
    private contracts;
    private teePrivateKey;
    private retryConfig;
    constructor(providerManager: ProviderManager, contracts: ContractAddresses, teePrivateKey: Hex, retryConfig?: Partial<RetryConfig>);
    /**
     * Commit a new PMT root to StateAnchor
     */
    commitRoot(newRoot: Hex, matchId: Hex, attestation: Uint8Array): Promise<TransactionReceipt>;
    /**
     * Get current root from StateAnchor
     */
    getCurrentRoot(): Promise<Hex>;
    /**
     * Get state version from StateAnchor
     */
    getStateVersion(): Promise<bigint>;
    /**
     * Get root at specific version
     */
    getRootAtVersion(version: bigint): Promise<Hex>;
    /**
     * Check if root is committed
     */
    isRootCommitted(root: Hex): Promise<boolean>;
    /**
     * Batch update encrypted balances
     */
    batchUpdateBalances(users: Address[], encryptedBalances: Hex[], stateRoot: Hex): Promise<TransactionReceipt>;
    /**
     * Process a withdrawal request
     */
    processWithdrawal(user: Address, amount: bigint, proof: Uint8Array): Promise<TransactionReceipt>;
    /**
     * Get encrypted balance for a user
     */
    getEncryptedBalance(user: Address): Promise<Hex>;
    /**
     * Get market details
     */
    getMarket(marketId: Hex): Promise<Market>;
    /**
     * Check if market exists
     */
    marketExists(marketId: Hex): Promise<boolean>;
    /**
     * Send a transaction
     */
    private sendTransaction;
    /**
     * Execute with retry and exponential backoff
     */
    private executeWithRetry;
    /**
     * Sleep helper
     */
    private sleep;
    /**
     * Get TEE address from contracts
     */
    verifyTEEAddress(): Promise<{
        stateAnchor: Address;
        privateToken: Address;
    }>;
}
/**
 * Create a contract caller instance
 */
export declare function createContractCaller(providerManager: ProviderManager, contracts: ContractAddresses, teePrivateKey: Hex, retryConfig?: Partial<RetryConfig>): ContractCaller;
export {};
//# sourceMappingURL=contractCaller.d.ts.map