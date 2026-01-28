/**
 * Secure logging for iPred TEE
 *
 * IMPORTANT: Never log sensitive data (private keys, decrypted payloads, user balances)
 */
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
/**
 * Secure logger class
 */
class Logger {
    level;
    prefix;
    constructor(config) {
        this.level = LOG_LEVELS[config.level];
        this.prefix = config.prefix ?? 'iPred-TEE';
    }
    /**
     * Format log entry as JSON
     */
    format(entry) {
        return JSON.stringify({
            ...entry,
            prefix: this.prefix,
        });
    }
    /**
     * Sanitize context to remove sensitive data
     */
    sanitize(context) {
        if (!context)
            return undefined;
        const sensitiveKeys = [
            'privateKey',
            'secretKey',
            'password',
            'secret',
            'encryptedPayload',
            'decryptedPayload',
            'balance',
            'amount',
        ];
        const sanitized = {};
        for (const [key, value] of Object.entries(context)) {
            const lowerKey = key.toLowerCase();
            const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));
            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            }
            else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitize(value);
            }
            else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    /**
     * Internal log method
     */
    log(level, message, context) {
        if (LOG_LEVELS[level] < this.level)
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: this.sanitize(context),
        };
        const formatted = this.format(entry);
        switch (level) {
            case 'debug':
            case 'info':
                console.log(formatted);
                break;
            case 'warn':
                console.warn(formatted);
                break;
            case 'error':
                console.error(formatted);
                break;
        }
    }
    debug(message, context) {
        this.log('debug', message, context);
    }
    info(message, context) {
        this.log('info', message, context);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    error(message, context) {
        this.log('error', message, context);
    }
    /**
     * Create child logger with additional prefix
     */
    child(name) {
        return new Logger({
            level: Object.entries(LOG_LEVELS).find(([_, v]) => v === this.level)?.[0] ?? 'info',
            prefix: `${this.prefix}:${name}`,
        });
    }
    /**
     * Set log level
     */
    setLevel(level) {
        this.level = LOG_LEVELS[level];
    }
}
/**
 * Global logger instance
 */
let globalLogger = null;
/**
 * Initialize global logger
 */
export function initLogger(config) {
    globalLogger = new Logger(config);
    return globalLogger;
}
/**
 * Get global logger (or create default)
 */
export function getLogger() {
    if (!globalLogger) {
        globalLogger = new Logger({ level: 'info' });
    }
    return globalLogger;
}
/**
 * Create named logger
 */
export function createLogger(name) {
    return getLogger().child(name);
}
export { Logger };
//# sourceMappingURL=logger.js.map