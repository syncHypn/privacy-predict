/**
 * Configuration management for iPred TEE
 */
/**
 * Load configuration from environment variables
 */
export function loadConfig() {
    const rpcUrls = getRequiredEnv('RPC_URLS').split(',').map(url => url.trim());
    if (rpcUrls.length === 0) {
        throw new Error('At least one RPC URL is required');
    }
    const contracts = {
        orderQueue: getRequiredEnv('ORDER_QUEUE_ADDRESS'),
        stateAnchor: getRequiredEnv('STATE_ANCHOR_ADDRESS'),
        privateToken: getRequiredEnv('PRIVATE_TOKEN_ADDRESS'),
        marketFactory: getRequiredEnv('MARKET_FACTORY_ADDRESS'),
    };
    validateAddress(contracts.orderQueue, 'ORDER_QUEUE_ADDRESS');
    validateAddress(contracts.stateAnchor, 'STATE_ANCHOR_ADDRESS');
    validateAddress(contracts.privateToken, 'PRIVATE_TOKEN_ADDRESS');
    validateAddress(contracts.marketFactory, 'MARKET_FACTORY_ADDRESS');
    const ipfsApiUrl = getEnv('IPFS_API_URL', 'https://ipfs.infura.io:5001') ?? 'https://ipfs.infura.io:5001';
    return {
        rpcUrls,
        contracts,
        ipfs: {
            apiUrl: ipfsApiUrl,
            projectId: getEnv('IPFS_PROJECT_ID'),
            projectSecret: getEnv('IPFS_PROJECT_SECRET'),
        },
        pollingIntervalMs: parseInt(getEnv('POLLING_INTERVAL_MS', '3000') ?? '3000', 10),
        snapshotIntervalMatches: parseInt(getEnv('SNAPSHOT_INTERVAL_MATCHES', '100') ?? '100', 10),
        logLevel: parseLogLevel(getEnv('LOG_LEVEL', 'info')),
    };
}
/**
 * Get required environment variable or throw
 */
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
/**
 * Get optional environment variable with default
 */
function getEnv(name, defaultValue) {
    return process.env[name] ?? defaultValue;
}
/**
 * Validate Ethereum address format
 */
function validateAddress(address, name) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(`Invalid address format for ${name}: ${address}`);
    }
}
/**
 * Parse log level with validation
 */
function parseLogLevel(level) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    const normalized = level?.toLowerCase();
    if (normalized && validLevels.includes(normalized)) {
        return normalized;
    }
    return 'info';
}
/**
 * Singleton config instance
 */
let configInstance = null;
/**
 * Get or create config instance
 */
export function getConfig() {
    if (!configInstance) {
        configInstance = loadConfig();
    }
    return configInstance;
}
/**
 * Reset config (for testing)
 */
export function resetConfig() {
    configInstance = null;
}
//# sourceMappingURL=config.js.map