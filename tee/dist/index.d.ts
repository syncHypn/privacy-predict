/**
 * iPred TEE Matching Engine
 *
 * Main entry point for the iExec TEE application.
 */
import type { Hex } from 'viem';
import type { TEEMode } from './types.js';
/**
 * TEE Application instance
 */
declare class TEEApplication {
    private isRunning;
    private mode;
    private pmtState;
    private keyManager;
    private providerManager;
    private stateManager;
    private eventListener;
    private contractCaller;
    private recoveryManager;
    private orderBook;
    private positionManager;
    private matcher;
    private oracleClient;
    /**
     * Initialize the TEE application
     */
    initialize(): Promise<void>;
    /**
     * Register event handlers for blockchain events
     */
    private registerEventHandlers;
    /**
     * Handle OrderSubmitted event
     */
    private handleOrderSubmitted;
    /**
     * Handle OrderCancelled event
     */
    private handleOrderCancelled;
    /**
     * Handle Deposit event
     */
    private handleDeposit;
    /**
     * Handle WithdrawalRequested event
     */
    private handleWithdrawalRequested;
    /**
     * Handle MarketResolved event
     */
    private handleMarketResolved;
    /**
     * Start the TEE application
     */
    start(): Promise<void>;
    /**
     * Stop the TEE application
     */
    stop(): Promise<void>;
    /**
     * Set TEE mode
     */
    setMode(mode: TEEMode): Promise<void>;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        mode: TEEMode;
        root: Hex;
        version: number;
        publicKey: Hex;
    };
}
export { TEEApplication };
//# sourceMappingURL=index.d.ts.map