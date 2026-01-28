/**
 * Multi-Provider Manager
 *
 * Provides reliable RPC connectivity with:
 * - Multiple provider fallback
 * - Automatic failover
 * - Health checking
 */
import { type PublicClient, type WalletClient, type Chain, type Transport, type Account } from 'viem';
/**
 * Provider health status
 */
interface ProviderHealth {
    url: string;
    healthy: boolean;
    latency: number;
    lastCheck: number;
    consecutiveFailures: number;
}
/**
 * Provider Manager configuration
 */
export interface ProviderManagerConfig {
    rpcUrls: string[];
    chain?: Chain;
    maxRetries?: number;
    healthCheckInterval?: number;
}
/**
 * Provider Manager class
 */
export declare class ProviderManager {
    private publicClients;
    private currentIndex;
    private health;
    private chain;
    private maxRetries;
    private healthCheckInterval;
    private healthCheckTimer?;
    constructor(config: ProviderManagerConfig);
    /**
     * Start periodic health checks
     */
    startHealthChecks(): void;
    /**
     * Stop health checks
     */
    stopHealthChecks(): void;
    /**
     * Check health of all providers
     */
    checkAllHealth(): Promise<void>;
    /**
     * Check health of a specific provider
     */
    private checkHealth;
    /**
     * Get the best available provider index
     */
    private getBestProviderIndex;
    /**
     * Get the current public client
     */
    getPublicClient(): PublicClient;
    /**
     * Create a wallet client for a specific account
     */
    createWalletClient(privateKey: `0x${string}`): WalletClient<Transport, Chain, Account>;
    /**
     * Execute a function with automatic retry and failover
     */
    execute<T>(fn: (client: PublicClient) => Promise<T>): Promise<T>;
    /**
     * Get health status of all providers
     */
    getHealthStatus(): ProviderHealth[];
    /**
     * Get the chain
     */
    getChain(): Chain;
    /**
     * Sleep helper
     */
    private sleep;
    /**
     * Cleanup
     */
    destroy(): void;
}
/**
 * Create a provider manager instance
 */
export declare function createProviderManager(config: ProviderManagerConfig): ProviderManager;
export {};
//# sourceMappingURL=providers.d.ts.map