/**
 * Multi-Provider Manager
 *
 * Provides reliable RPC connectivity with:
 * - Multiple provider fallback
 * - Automatic failover
 * - Health checking
 */
import { createPublicClient, createWalletClient, http, } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { BlockchainError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('ProviderManager');
/**
 * Provider Manager class
 */
export class ProviderManager {
    publicClients = [];
    currentIndex = 0;
    health = [];
    chain;
    maxRetries;
    healthCheckInterval;
    healthCheckTimer;
    constructor(config) {
        if (config.rpcUrls.length === 0) {
            throw new BlockchainError('At least one RPC URL is required');
        }
        this.chain = config.chain ?? arbitrumSepolia;
        this.maxRetries = config.maxRetries ?? 3;
        this.healthCheckInterval = config.healthCheckInterval ?? 30000;
        // Initialize clients and health tracking
        for (const url of config.rpcUrls) {
            const client = createPublicClient({
                chain: this.chain,
                transport: http(url),
            });
            this.publicClients.push(client);
            this.health.push({
                url,
                healthy: true,
                latency: 0,
                lastCheck: 0,
                consecutiveFailures: 0,
            });
        }
        logger.info('Initialized provider manager', {
            providerCount: config.rpcUrls.length,
            chain: this.chain.name,
        });
    }
    /**
     * Start periodic health checks
     */
    startHealthChecks() {
        if (this.healthCheckTimer)
            return;
        this.healthCheckTimer = setInterval(() => {
            void this.checkAllHealth();
        }, this.healthCheckInterval);
        // Initial check
        void this.checkAllHealth();
    }
    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }
    /**
     * Check health of all providers
     */
    async checkAllHealth() {
        await Promise.all(this.publicClients.map((_, index) => this.checkHealth(index)));
    }
    /**
     * Check health of a specific provider
     */
    async checkHealth(index) {
        const client = this.publicClients[index];
        const healthRecord = this.health[index];
        if (!client || !healthRecord)
            return;
        const startTime = Date.now();
        try {
            await client.getBlockNumber();
            const latency = Date.now() - startTime;
            healthRecord.healthy = true;
            healthRecord.latency = latency;
            healthRecord.lastCheck = Date.now();
            healthRecord.consecutiveFailures = 0;
        }
        catch (error) {
            healthRecord.healthy = false;
            healthRecord.lastCheck = Date.now();
            healthRecord.consecutiveFailures++;
            logger.warn('Provider health check failed', {
                url: healthRecord.url,
                consecutiveFailures: healthRecord.consecutiveFailures,
                error: String(error),
            });
        }
    }
    /**
     * Get the best available provider index
     */
    getBestProviderIndex() {
        // First, try to find a healthy provider
        const healthyIndices = this.health
            .map((h, i) => ({ health: h, index: i }))
            .filter(({ health }) => health.healthy)
            .sort((a, b) => a.health.latency - b.health.latency);
        if (healthyIndices.length > 0) {
            return healthyIndices[0].index;
        }
        // If no healthy providers, try the one with fewest consecutive failures
        const sortedByFailures = [...this.health]
            .map((h, i) => ({ health: h, index: i }))
            .sort((a, b) => a.health.consecutiveFailures - b.health.consecutiveFailures);
        return sortedByFailures[0]?.index ?? 0;
    }
    /**
     * Get the current public client
     */
    getPublicClient() {
        this.currentIndex = this.getBestProviderIndex();
        const client = this.publicClients[this.currentIndex];
        if (!client) {
            throw new BlockchainError('No public client available');
        }
        return client;
    }
    /**
     * Create a wallet client for a specific account
     */
    createWalletClient(privateKey) {
        const account = privateKeyToAccount(privateKey);
        const rpcUrl = this.health[this.currentIndex]?.url;
        if (!rpcUrl) {
            throw new BlockchainError('No RPC URL available');
        }
        return createWalletClient({
            account,
            chain: this.chain,
            transport: http(rpcUrl),
        });
    }
    /**
     * Execute a function with automatic retry and failover
     */
    async execute(fn) {
        let lastError;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const index = this.getBestProviderIndex();
            const client = this.publicClients[index];
            const healthRecord = this.health[index];
            if (!client || !healthRecord) {
                continue;
            }
            try {
                const result = await fn(client);
                // Mark as healthy on success
                healthRecord.healthy = true;
                healthRecord.consecutiveFailures = 0;
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Mark as unhealthy
                healthRecord.consecutiveFailures++;
                if (healthRecord.consecutiveFailures >= 3) {
                    healthRecord.healthy = false;
                }
                logger.warn('Provider call failed, retrying', {
                    url: healthRecord.url,
                    attempt: attempt + 1,
                    maxRetries: this.maxRetries,
                    error: lastError.message,
                });
                // Wait before retry with exponential backoff
                if (attempt < this.maxRetries - 1) {
                    await this.sleep(Math.pow(2, attempt) * 1000);
                }
            }
        }
        throw new BlockchainError(`All ${this.maxRetries} retry attempts failed`, { lastError: lastError?.message });
    }
    /**
     * Get health status of all providers
     */
    getHealthStatus() {
        return [...this.health];
    }
    /**
     * Get the chain
     */
    getChain() {
        return this.chain;
    }
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Cleanup
     */
    destroy() {
        this.stopHealthChecks();
    }
}
/**
 * Create a provider manager instance
 */
export function createProviderManager(config) {
    return new ProviderManager(config);
}
//# sourceMappingURL=providers.js.map