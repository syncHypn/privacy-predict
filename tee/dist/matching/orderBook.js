/**
 * PMT-based Order Book
 *
 * Stores orders in Patricia Merkle Trie with lexicographically sorted keys
 * to achieve price-time priority via key iteration.
 */
import { encodeOrderKey, getOrderKeyPrefix, orderSideToKeyString, } from './priceEncoder.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('OrderBook');
/**
 * PMT Order Book class
 */
export class PMTOrderBook {
    pmtState;
    constructor(pmtState) {
        this.pmtState = pmtState;
    }
    /**
     * Add a resting order to the book
     */
    async addOrder(order) {
        const side = orderSideToKeyString(order.side);
        // Build PMT key
        const key = encodeOrderKey({
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            side,
            price: order.price,
            orderId: order.orderId,
        });
        // Serialize order value
        const value = this.serializeOrder(order);
        // Store in PMT
        await this.pmtState.put(key, value);
        // Store index for lookup by orderId
        await this.storeOrderIndex(order.orderId, {
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            side,
            price: order.price,
        });
        logger.debug('Order added', {
            orderId: order.orderId,
            marketId: order.marketId,
            side: order.side,
            price: order.price,
        });
    }
    /**
     * Remove an order from the book
     */
    async removeOrder(orderId) {
        // Get order index
        const index = await this.getOrderIndex(orderId);
        if (!index) {
            return null;
        }
        // Build key from index
        const key = encodeOrderKey({
            marketId: index.marketId,
            outcomeIndex: index.outcomeIndex,
            side: index.side,
            price: index.price,
            orderId,
        });
        // Get order before removal
        const order = await this.getOrderByKey(key);
        // Remove from PMT
        await this.pmtState.del(key);
        // Remove index
        await this.removeOrderIndex(orderId);
        if (order) {
            logger.debug('Order removed', { orderId });
        }
        return order;
    }
    /**
     * Update an order (partial fill)
     */
    async updateOrder(orderId, newAmount, newStatus) {
        // Get current order
        const order = await this.getOrder(orderId);
        if (!order) {
            return null;
        }
        // Update fields
        order.amount = newAmount;
        order.status = newStatus;
        // Re-store (key stays the same since price doesn't change)
        const side = orderSideToKeyString(order.side);
        const key = encodeOrderKey({
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            side,
            price: order.price,
            orderId: order.orderId,
        });
        const value = this.serializeOrder(order);
        await this.pmtState.put(key, value);
        logger.debug('Order updated', {
            orderId,
            newAmount: newAmount.toString(),
            newStatus,
        });
        return order;
    }
    /**
     * Get an order by ID
     */
    async getOrder(orderId) {
        const index = await this.getOrderIndex(orderId);
        if (!index) {
            return null;
        }
        const key = encodeOrderKey({
            marketId: index.marketId,
            outcomeIndex: index.outcomeIndex,
            side: index.side,
            price: index.price,
            orderId,
        });
        return this.getOrderByKey(key);
    }
    /**
     * Get an order by its PMT key
     */
    async getOrderByKey(key) {
        const value = await this.pmtState.get(key);
        if (!value) {
            return null;
        }
        return this.deserializeOrder(value);
    }
    /**
     * Iterate matchable orders for a specific market/outcome/side
     *
     * Orders are yielded in price-time priority order:
     * - Asks: lowest price first (best for buyer)
     * - Bids: highest price first (best for seller)
     */
    async *iterateMatchableOrders(marketId, outcomeIndex, matchSide) {
        const prefix = getOrderKeyPrefix(marketId, outcomeIndex, matchSide);
        // Iterate all orders with this prefix
        // Keys are sorted lexicographically, which gives us price-time priority
        // due to our encoding scheme
        for await (const entry of this.pmtState.iteratePrefix(prefix)) {
            const order = this.deserializeOrder(entry.value);
            // Only yield OPEN or PARTIAL orders
            if (order.status === 'OPEN' || order.status === 'PARTIAL') {
                yield order;
            }
        }
    }
    /**
     * Get the best bid/ask spread for a market outcome
     */
    async getSpread(marketId, outcomeIndex) {
        let bestBid = null;
        let bestAsk = null;
        // Get best bid (first in descending price order)
        for await (const order of this.iterateMatchableOrders(marketId, outcomeIndex, 'bid')) {
            bestBid = order.price;
            break;
        }
        // Get best ask (first in ascending price order)
        for await (const order of this.iterateMatchableOrders(marketId, outcomeIndex, 'ask')) {
            bestAsk = order.price;
            break;
        }
        return {
            marketId,
            outcomeIndex,
            bestBid,
            bestAsk,
            lastPrice: null, // Would need separate tracking
        };
    }
    /**
     * Get all orders for a user in a specific market
     */
    async getUserMarketOrders(userId, marketId) {
        const orders = [];
        // We need to iterate all outcomes and sides
        // This is inefficient - in production, maintain a secondary index
        for (let outcomeIndex = 0; outcomeIndex < 10; outcomeIndex++) {
            for (const side of ['bid', 'ask']) {
                for await (const order of this.iterateMatchableOrders(marketId, outcomeIndex, side)) {
                    if (order.userId.toLowerCase() === userId.toLowerCase()) {
                        orders.push(order);
                    }
                }
            }
        }
        return orders;
    }
    /**
     * Get all orders for a user
     */
    async getUserOrders(userId) {
        // This requires iterating the entire order index
        // In production, maintain a user -> orders index
        const orders = [];
        const indexPrefix = 'order-index:';
        for await (const entry of this.pmtState.iteratePrefix(indexPrefix)) {
            const orderId = entry.key.slice(indexPrefix.length);
            const order = await this.getOrder(orderId);
            if (order && order.userId.toLowerCase() === userId.toLowerCase()) {
                orders.push(order);
            }
        }
        return orders;
    }
    /**
     * Count orders in the book for a market/outcome/side
     */
    async countOrders(marketId, outcomeIndex, side) {
        let count = 0;
        for await (const _ of this.iterateMatchableOrders(marketId, outcomeIndex, side)) {
            count++;
        }
        return count;
    }
    // ============================================================================
    // Order Index Operations
    // ============================================================================
    /**
     * Store order index for O(1) lookup by orderId
     */
    async storeOrderIndex(orderId, index) {
        const key = `order-index:${orderId}`;
        await this.pmtState.putJSON(key, index);
    }
    /**
     * Get order index
     */
    async getOrderIndex(orderId) {
        const key = `order-index:${orderId}`;
        return this.pmtState.getJSON(key);
    }
    /**
     * Remove order index
     */
    async removeOrderIndex(orderId) {
        const key = `order-index:${orderId}`;
        await this.pmtState.del(key);
    }
    // ============================================================================
    // Serialization
    // ============================================================================
    /**
     * Serialize order value to bytes
     */
    serializeOrder(order) {
        const data = {
            orderId: order.orderId,
            userId: order.userId,
            marketId: order.marketId,
            outcomeIndex: order.outcomeIndex,
            side: order.side,
            price: order.price,
            amount: order.amount.toString(),
            originalAmount: order.originalAmount.toString(),
            timestamp: order.timestamp,
            status: order.status,
        };
        return new TextEncoder().encode(JSON.stringify(data));
    }
    /**
     * Deserialize order value from bytes
     */
    deserializeOrder(data) {
        const text = new TextDecoder().decode(data);
        const obj = JSON.parse(text);
        return {
            orderId: obj.orderId,
            userId: obj.userId,
            marketId: obj.marketId,
            outcomeIndex: obj.outcomeIndex,
            side: obj.side,
            price: obj.price,
            amount: BigInt(obj.amount),
            originalAmount: BigInt(obj.originalAmount),
            timestamp: obj.timestamp,
            status: obj.status,
        };
    }
}
/**
 * Create an order book instance
 */
export function createOrderBook(pmtState) {
    return new PMTOrderBook(pmtState);
}
//# sourceMappingURL=orderBook.js.map