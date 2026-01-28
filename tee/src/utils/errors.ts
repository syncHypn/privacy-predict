/**
 * Custom error types for iPred TEE
 */

/**
 * Base error class for iPred TEE errors
 */
export class IPredError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IPredError';
  }
}

/**
 * Order validation errors
 */
export class OrderValidationError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ORDER_VALIDATION_ERROR', details);
    this.name = 'OrderValidationError';
  }
}

/**
 * Insufficient balance error
 */
export class InsufficientBalanceError extends IPredError {
  constructor(
    public readonly userId: string,
    public readonly required: bigint,
    public readonly available: bigint
  ) {
    super(
      `Insufficient balance: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE',
      { userId, required: required.toString(), available: available.toString() }
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Market not found error
 */
export class MarketNotFoundError extends IPredError {
  constructor(public readonly marketId: string) {
    super(`Market not found: ${marketId}`, 'MARKET_NOT_FOUND', { marketId });
    this.name = 'MarketNotFoundError';
  }
}

/**
 * Market resolved error (cannot submit orders)
 */
export class MarketResolvedError extends IPredError {
  constructor(public readonly marketId: string) {
    super(`Market already resolved: ${marketId}`, 'MARKET_RESOLVED', { marketId });
    this.name = 'MarketResolvedError';
  }
}

/**
 * Order not found error
 */
export class OrderNotFoundError extends IPredError {
  constructor(public readonly orderId: string) {
    super(`Order not found: ${orderId}`, 'ORDER_NOT_FOUND', { orderId });
    this.name = 'OrderNotFoundError';
  }
}

/**
 * Decryption error
 */
export class DecryptionError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DECRYPTION_ERROR', details);
    this.name = 'DecryptionError';
  }
}

/**
 * State error (PMT operations)
 */
export class StateError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', details);
    this.name = 'StateError';
  }
}

/**
 * Blockchain interaction error
 */
export class BlockchainError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BLOCKCHAIN_ERROR', details);
    this.name = 'BlockchainError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Recovery error
 */
export class RecoveryError extends IPredError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RECOVERY_ERROR', details);
    this.name = 'RecoveryError';
  }
}

/**
 * TEE mode error (operation not allowed in current mode)
 */
export class TEEModeError extends IPredError {
  constructor(
    public readonly currentMode: string,
    public readonly operation: string
  ) {
    super(
      `Operation '${operation}' not allowed in mode '${currentMode}'`,
      'TEE_MODE_ERROR',
      { currentMode, operation }
    );
    this.name = 'TEEModeError';
  }
}

/**
 * Type guard for IPredError
 */
export function isIPredError(error: unknown): error is IPredError {
  return error instanceof IPredError;
}

/**
 * Wrap unknown error in IPredError
 */
export function wrapError(error: unknown, defaultCode = 'UNKNOWN_ERROR'): IPredError {
  if (isIPredError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new IPredError(error.message, defaultCode, {
      originalName: error.name,
      stack: error.stack,
    });
  }

  return new IPredError(String(error), defaultCode);
}
