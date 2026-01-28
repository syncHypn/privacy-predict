/**
 * Secure logging for iPred TEE
 *
 * IMPORTANT: Never log sensitive data (private keys, decrypted payloads, user balances)
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Logger configuration
 */
interface LoggerConfig {
    level: LogLevel;
    prefix?: string;
}
/**
 * Secure logger class
 */
declare class Logger {
    private level;
    private prefix;
    constructor(config: LoggerConfig);
    /**
     * Format log entry as JSON
     */
    private format;
    /**
     * Sanitize context to remove sensitive data
     */
    private sanitize;
    /**
     * Internal log method
     */
    private log;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
    /**
     * Create child logger with additional prefix
     */
    child(name: string): Logger;
    /**
     * Set log level
     */
    setLevel(level: LogLevel): void;
}
/**
 * Initialize global logger
 */
export declare function initLogger(config: LoggerConfig): Logger;
/**
 * Get global logger (or create default)
 */
export declare function getLogger(): Logger;
/**
 * Create named logger
 */
export declare function createLogger(name: string): Logger;
export { Logger, type LogLevel, type LoggerConfig };
//# sourceMappingURL=logger.d.ts.map