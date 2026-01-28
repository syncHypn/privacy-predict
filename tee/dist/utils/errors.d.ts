/**
 * Custom error types for iPred TEE
 */
/**
 * Base error class for iPred TEE errors
 */
export declare class IPredError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, code: string, details?: Record<string, unknown> | undefined);
}
/**
 * Order validation errors
 */
export declare class OrderValidationError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Insufficient balance error
 */
export declare class InsufficientBalanceError extends IPredError {
    readonly userId: string;
    readonly required: bigint;
    readonly available: bigint;
    constructor(userId: string, required: bigint, available: bigint);
}
/**
 * Market not found error
 */
export declare class MarketNotFoundError extends IPredError {
    readonly marketId: string;
    constructor(marketId: string);
}
/**
 * Market resolved error (cannot submit orders)
 */
export declare class MarketResolvedError extends IPredError {
    readonly marketId: string;
    constructor(marketId: string);
}
/**
 * Order not found error
 */
export declare class OrderNotFoundError extends IPredError {
    readonly orderId: string;
    constructor(orderId: string);
}
/**
 * Decryption error
 */
export declare class DecryptionError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * State error (PMT operations)
 */
export declare class StateError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Blockchain interaction error
 */
export declare class BlockchainError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Configuration error
 */
export declare class ConfigurationError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Recovery error
 */
export declare class RecoveryError extends IPredError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * TEE mode error (operation not allowed in current mode)
 */
export declare class TEEModeError extends IPredError {
    readonly currentMode: string;
    readonly operation: string;
    constructor(currentMode: string, operation: string);
}
/**
 * Type guard for IPredError
 */
export declare function isIPredError(error: unknown): error is IPredError;
/**
 * Wrap unknown error in IPredError
 */
export declare function wrapError(error: unknown, defaultCode?: string): IPredError;
//# sourceMappingURL=errors.d.ts.map