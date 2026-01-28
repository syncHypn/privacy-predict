/**
 * PMT-based Order Book
 *
 * Stores orders in Patricia Merkle Trie with lexicographically sorted keys
 * to achieve price-time priority via key iteration.
 */
import type { Address, Hex } from 'viem';
import type { OrderValue, Spread } from '../types.js';
import type { PMTState } from '../state/pmtState.js';
/**
 * PMT Order Book class
 */
export declare class PMTOrderBook {
    private pmtState;
    constructor(pmtState: PMTState);
    /**
     * Add a resting order to the book
     */
    addOrder(order: OrderValue): Promise<void>;
    /**
     * Remove an order from the book
     */
    removeOrder(orderId: Hex): Promise<OrderValue | null>;
    /**
     * Update an order (partial fill)
     */
    updateOrder(orderId: Hex, newAmount: bigint, newStatus: OrderValue['status']): Promise<OrderValue | null>;
    /**
     * Get an order by ID
     */
    getOrder(orderId: Hex): Promise<OrderValue | null>;
    /**
     * Get an order by its PMT key
     */
    private getOrderByKey;
    /**
     * Iterate matchable orders for a specific market/outcome/side
     *
     * Orders are yielded in price-time priority order:
     * - Asks: lowest price first (best for buyer)
     * - Bids: highest price first (best for seller)
     */
    iterateMatchableOrders(marketId: Hex, outcomeIndex: number, matchSide: 'bid' | 'ask'): AsyncGenerator<OrderValue>;
    /**
     * Get the best bid/ask spread for a market outcome
     */
    getSpread(marketId: Hex, outcomeIndex: number): Promise<Spread>;
    /**
     * Get all orders for a user in a specific market
     */
    getUserMarketOrders(userId: Address, marketId: Hex): Promise<OrderValue[]>;
    /**
     * Get all orders for a user
     */
    getUserOrders(userId: Address): Promise<OrderValue[]>;
    /**
     * Count orders in the book for a market/outcome/side
     */
    countOrders(marketId: Hex, outcomeIndex: number, side: 'bid' | 'ask'): Promise<number>;
    /**
     * Store order index for O(1) lookup by orderId
     */
    private storeOrderIndex;
    /**
     * Get order index
     */
    private getOrderIndex;
    /**
     * Remove order index
     */
    private removeOrderIndex;
    /**
     * Serialize order value to bytes
     */
    private serializeOrder;
    /**
     * Deserialize order value from bytes
     */
    private deserializeOrder;
}
/**
 * Create an order book instance
 */
export declare function createOrderBook(pmtState: PMTState): PMTOrderBook;
//# sourceMappingURL=orderBook.d.ts.map