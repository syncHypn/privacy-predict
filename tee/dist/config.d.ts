/**
 * Configuration management for iPred TEE
 */
import type { AppConfig } from './types.js';
/**
 * Load configuration from environment variables
 */
export declare function loadConfig(): AppConfig;
/**
 * Get or create config instance
 */
export declare function getConfig(): AppConfig;
/**
 * Reset config (for testing)
 */
export declare function resetConfig(): void;
//# sourceMappingURL=config.d.ts.map