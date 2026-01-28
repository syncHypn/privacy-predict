/**
 * Secure logging for iPred TEE
 *
 * IMPORTANT: Never log sensitive data (private keys, decrypted payloads, user balances)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
}

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Secure logger class
 */
class Logger {
  private level: number;
  private prefix: string;

  constructor(config: LoggerConfig) {
    this.level = LOG_LEVELS[config.level];
    this.prefix = config.prefix ?? 'iPred-TEE';
  }

  /**
   * Format log entry as JSON
   */
  private format(entry: LogEntry): string {
    return JSON.stringify({
      ...entry,
      prefix: this.prefix,
    });
  }

  /**
   * Sanitize context to remove sensitive data
   */
  private sanitize(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

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

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.level) return;

    const entry: LogEntry = {
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

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  /**
   * Create child logger with additional prefix
   */
  child(name: string): Logger {
    return new Logger({
      level: Object.entries(LOG_LEVELS).find(([_, v]) => v === this.level)?.[0] as LogLevel ?? 'info',
      prefix: `${this.prefix}:${name}`,
    });
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = LOG_LEVELS[level];
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Initialize global logger
 */
export function initLogger(config: LoggerConfig): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

/**
 * Get global logger (or create default)
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({ level: 'info' });
  }
  return globalLogger;
}

/**
 * Create named logger
 */
export function createLogger(name: string): Logger {
  return getLogger().child(name);
}

export { Logger, type LogLevel, type LoggerConfig };
