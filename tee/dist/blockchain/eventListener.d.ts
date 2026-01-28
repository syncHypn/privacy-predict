/**
 * Event Listener
 *
 * Polls blockchain for events from:
 * - OrderQueue: OrderSubmitted, OrderCancelled
 * - PrivateToken: Deposit, WithdrawalRequested
 * - MarketFactory: MarketResolved
 */
import type { OrderSubmittedEvent, OrderCancelledEvent, DepositEvent, WithdrawalRequestedEvent, MarketResolvedEvent, ContractAddresses } from '../types.js';
import type { ProviderManager } from './providers.js';
/**
 * Event handlers type
 */
export interface EventHandlers {
    onOrderSubmitted?: (event: OrderSubmittedEvent) => Promise<void>;
    onOrderCancelled?: (event: OrderCancelledEvent) => Promise<void>;
    onDeposit?: (event: DepositEvent) => Promise<void>;
    onWithdrawalRequested?: (event: WithdrawalRequestedEvent) => Promise<void>;
    onMarketResolved?: (event: MarketResolvedEvent) => Promise<void>;
}
/**
 * Event Listener class
 */
export declare class EventListener {
    private providerManager;
    private contracts;
    private pollingInterval;
    private lastProcessedBlock;
    private isRunning;
    private pollTimer?;
    private handlers;
    constructor(providerManager: ProviderManager, contracts: ContractAddresses, pollingInterval?: number);
    /**
     * Register event handlers
     */
    onOrderSubmitted(handler: (event: OrderSubmittedEvent) => Promise<void>): void;
    onOrderCancelled(handler: (event: OrderCancelledEvent) => Promise<void>): void;
    onDeposit(handler: (event: DepositEvent) => Promise<void>): void;
    onWithdrawalRequested(handler: (event: WithdrawalRequestedEvent) => Promise<void>): void;
    onMarketResolved(handler: (event: MarketResolvedEvent) => Promise<void>): void;
    /**
     * Start listening for events
     */
    start(fromBlock?: bigint): Promise<void>;
    /**
     * Stop listening
     */
    stop(): void;
    /**
     * Poll for new events
     */
    private poll;
    /**
     * Process new blocks for events
     */
    private processNewBlocks;
    /**
     * Fetch OrderSubmitted events
     */
    private fetchOrderSubmittedEvents;
    /**
     * Parse OrderSubmitted log
     */
    private parseOrderSubmittedLog;
    /**
     * Fetch OrderCancelled events
     */
    private fetchOrderCancelledEvents;
    /**
     * Parse OrderCancelled log
     */
    private parseOrderCancelledLog;
    /**
     * Fetch Deposit events
     */
    private fetchDepositEvents;
    /**
     * Parse Deposit log
     */
    private parseDepositLog;
    /**
     * Fetch WithdrawalRequested events
     */
    private fetchWithdrawalRequestedEvents;
    /**
     * Parse WithdrawalRequested log
     */
    private parseWithdrawalRequestedLog;
    /**
     * Fetch MarketResolved events
     */
    private fetchMarketResolvedEvents;
    /**
     * Parse MarketResolved log
     */
    private parseMarketResolvedLog;
    /**
     * Sync from a specific block (for recovery)
     */
    syncFromBlock(fromBlock: bigint): Promise<void>;
    /**
     * Get last processed block
     */
    getLastProcessedBlock(): bigint;
    /**
     * Set last processed block
     */
    setLastProcessedBlock(block: bigint): void;
    /**
     * Check if running
     */
    isListening(): boolean;
}
/**
 * Create an event listener instance
 */
export declare function createEventListener(providerManager: ProviderManager, contracts: ContractAddresses, pollingInterval?: number): EventListener;
//# sourceMappingURL=eventListener.d.ts.map