/**
 * Configuration management for iPred TEE
 */

import type { Address } from 'viem';
import type { AppConfig, ContractAddresses } from './types.js';

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const rpcUrls = getRequiredEnv('RPC_URLS').split(',').map(url => url.trim());

  if (rpcUrls.length === 0) {
    throw new Error('At least one RPC URL is required');
  }

  const contracts: ContractAddresses = {
    orderQueue: getRequiredEnv('ORDER_QUEUE_ADDRESS') as Address,
    stateAnchor: getRequiredEnv('STATE_ANCHOR_ADDRESS') as Address,
    privateToken: getRequiredEnv('PRIVATE_TOKEN_ADDRESS') as Address,
    marketFactory: getRequiredEnv('MARKET_FACTORY_ADDRESS') as Address,
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
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * Validate Ethereum address format
 */
function validateAddress(address: string, name: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid address format for ${name}: ${address}`);
  }
}

/**
 * Parse log level with validation
 */
function parseLogLevel(level: string | undefined): AppConfig['logLevel'] {
  const validLevels = ['debug', 'info', 'warn', 'error'] as const;
  const normalized = level?.toLowerCase();

  if (normalized && validLevels.includes(normalized as typeof validLevels[number])) {
    return normalized as AppConfig['logLevel'];
  }

  return 'info';
}

/**
 * Singleton config instance
 */
let configInstance: AppConfig | null = null;

/**
 * Get or create config instance
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset config (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}
