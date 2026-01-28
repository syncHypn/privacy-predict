/**
 * Matching Engine
 *
 * Price-time priority matching algorithm that:
 * 1. Takes incoming order
 * 2. Matches against resting orders in PMT
 * 3. Updates positions for both parties
 * 4. Adds remaining amount as resting order
 * 5. Returns fills and new PMT root
 */
import type { Address, Hex } from 'viem';
import type { OrderPayload, MatchResult } from '../types.js';
import type { PMTOrderBook } from './orderBook.js';
import type { PositionManager } from './positionManager.js';
import type { StateManager } from '../state/stateManager.js';
/**
 * Matching Engine class
 */
export declare class Matcher {
    private orderBook;
    private positionManager;
    private stateManager;
    constructor(orderBook: PMTOrderBook, positionManager: PositionManager, stateManager: StateManager);
    /**
     * Process an incoming order
     *
     * @param payload - Decrypted order payload
     * @param orderId - Order ID from event
     * @param userId - User address from event
     * @param marketId - Market ID from event
     * @param timestamp - Timestamp from event
     * @returns Match result with fills and new root
     */
    processOrder(payload: OrderPayload, orderId: Hex, userId: Address, marketId: Hex, timestamp: number): Promise<MatchResult>;
    /**
     * Execute a fill between maker and taker
     */
    private executeFill;
    /**
     * Validate an order payload
     */
    private validateOrder;
    /**
     * Check if taker price matches maker price
     */
    private priceMatches;
    /**
     * Calculate required collateral for an order
     *
     * For buying shares: collateral = price * amount
     * For selling shares: collateral = (1 - price) * amount
     */
    private calculateRequiredCollateral;
    /**
     * Cancel an order
     */
    cancelOrder(orderId: Hex, userId: Address): Promise<boolean>;
}
/**
 * Create a matcher instance
 */
export declare function createMatcher(orderBook: PMTOrderBook, positionManager: PositionManager, stateManager: StateManager): Matcher;
//# sourceMappingURL=matcher.d.ts.map