/**
 * Custom error types for iPred TEE
 */
/**
 * Base error class for iPred TEE errors
 */
export class IPredError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'IPredError';
    }
}
/**
 * Order validation errors
 */
export class OrderValidationError extends IPredError {
    constructor(message, details) {
        super(message, 'ORDER_VALIDATION_ERROR', details);
        this.name = 'OrderValidationError';
    }
}
/**
 * Insufficient balance error
 */
export class InsufficientBalanceError extends IPredError {
    userId;
    required;
    available;
    constructor(userId, required, available) {
        super(`Insufficient balance: required ${required}, available ${available}`, 'INSUFFICIENT_BALANCE', { userId, required: required.toString(), available: available.toString() });
        this.userId = userId;
        this.required = required;
        this.available = available;
        this.name = 'InsufficientBalanceError';
    }
}
/**
 * Market not found error
 */
export class MarketNotFoundError extends IPredError {
    marketId;
    constructor(marketId) {
        super(`Market not found: ${marketId}`, 'MARKET_NOT_FOUND', { marketId });
        this.marketId = marketId;
        this.name = 'MarketNotFoundError';
    }
}
/**
 * Market resolved error (cannot submit orders)
 */
export class MarketResolvedError extends IPredError {
    marketId;
    constructor(marketId) {
        super(`Market already resolved: ${marketId}`, 'MARKET_RESOLVED', { marketId });
        this.marketId = marketId;
        this.name = 'MarketResolvedError';
    }
}
/**
 * Order not found error
 */
export class OrderNotFoundError extends IPredError {
    orderId;
    constructor(orderId) {
        super(`Order not found: ${orderId}`, 'ORDER_NOT_FOUND', { orderId });
        this.orderId = orderId;
        this.name = 'OrderNotFoundError';
    }
}
/**
 * Decryption error
 */
export class DecryptionError extends IPredError {
    constructor(message, details) {
        super(message, 'DECRYPTION_ERROR', details);
        this.name = 'DecryptionError';
    }
}
/**
 * State error (PMT operations)
 */
export class StateError extends IPredError {
    constructor(message, details) {
        super(message, 'STATE_ERROR', details);
        this.name = 'StateError';
    }
}
/**
 * Blockchain interaction error
 */
export class BlockchainError extends IPredError {
    constructor(message, details) {
        super(message, 'BLOCKCHAIN_ERROR', details);
        this.name = 'BlockchainError';
    }
}
/**
 * Configuration error
 */
export class ConfigurationError extends IPredError {
    constructor(message, details) {
        super(message, 'CONFIGURATION_ERROR', details);
        this.name = 'ConfigurationError';
    }
}
/**
 * Recovery error
 */
export class RecoveryError extends IPredError {
    constructor(message, details) {
        super(message, 'RECOVERY_ERROR', details);
        this.name = 'RecoveryError';
    }
}
/**
 * TEE mode error (operation not allowed in current mode)
 */
export class TEEModeError extends IPredError {
    currentMode;
    operation;
    constructor(currentMode, operation) {
        super(`Operation '${operation}' not allowed in mode '${currentMode}'`, 'TEE_MODE_ERROR', { currentMode, operation });
        this.currentMode = currentMode;
        this.operation = operation;
        this.name = 'TEEModeError';
    }
}
/**
 * Type guard for IPredError
 */
export function isIPredError(error) {
    return error instanceof IPredError;
}
/**
 * Wrap unknown error in IPredError
 */
export function wrapError(error, defaultCode = 'UNKNOWN_ERROR') {
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
//# sourceMappingURL=errors.js.map