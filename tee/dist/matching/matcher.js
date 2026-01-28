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
import { keccak256, toHex } from 'viem';
import { OrderValidationError, InsufficientBalanceError, } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('Matcher');
/**
 * Matching Engine class
 */
export class Matcher {
    orderBook;
    positionManager;
    stateManager;
    constructor(orderBook, positionManager, stateManager) {
        this.orderBook = orderBook;
        this.positionManager = positionManager;
        this.stateManager = stateManager;
    }
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
    async processOrder(payload, orderId, userId, marketId, timestamp) {
        logger.info('Processing order', {
            orderId,
            userId,
            marketId,
            side: payload.side,
            price: payload.price,
        });
        // Validate order
        const validation = this.validateOrder(payload);
        if (!validation.valid) {
            throw new OrderValidationError(validation.error ?? 'Invalid order');
        }
        // Check user has sufficient balance
        const requiredCollateral = this.calculateRequiredCollateral(payload.side, payload.price, payload.amount);
        const balance = await this.stateManager.getBalance(userId);
        if (balance.available < requiredCollateral) {
            throw new InsufficientBalanceError(userId, requiredCollateral, balance.available);
        }
        // Lock collateral
        await this.stateManager.lockBalance(userId, requiredCollateral);
        // Determine match side (taker buys from asks, taker sells to bids)
        const matchSide = payload.side === 'BUY' ? 'ask' : 'bid';
        // Execute matching
        const fills = [];
        let remainingAmount = payload.amount;
        // Iterate resting orders in price-time priority
        for await (const makerOrder of this.orderBook.iterateMatchableOrders(marketId, payload.outcomeIndex, matchSide)) {
            // Check price compatibility
            if (!this.priceMatches(payload.side, payload.price, makerOrder.price)) {
                break; // No more matchable orders at acceptable prices
            }
            // Calculate fill amount
            const fillAmount = remainingAmount < makerOrder.amount
                ? remainingAmount
                : makerOrder.amount;
            // Execute fill
            const fill = await this.executeFill(makerOrder, orderId, userId, fillAmount, makerOrder.price, timestamp);
            fills.push(fill);
            remainingAmount -= fillAmount;
            // Update maker order
            const newMakerAmount = makerOrder.amount - fillAmount;
            if (newMakerAmount === 0n) {
                // Order fully filled - remove
                await this.orderBook.removeOrder(makerOrder.orderId);
                // Unlock remaining maker collateral
                const makerUnlock = this.calculateRequiredCollateral(makerOrder.side, makerOrder.price, 0n);
                // Already processed in executeFill
            }
            else {
                // Partial fill - update
                await this.orderBook.updateOrder(makerOrder.orderId, newMakerAmount, 'PARTIAL');
            }
            if (remainingAmount === 0n) {
                break;
            }
        }
        // Add remaining as resting order if any
        let restingOrderAdded = false;
        if (remainingAmount > 0n) {
            const restingOrder = {
                orderId,
                userId,
                marketId,
                outcomeIndex: payload.outcomeIndex,
                side: payload.side,
                price: payload.price,
                amount: remainingAmount,
                originalAmount: payload.amount,
                timestamp,
                status: fills.length > 0 ? 'PARTIAL' : 'OPEN',
            };
            await this.orderBook.addOrder(restingOrder);
            restingOrderAdded = true;
            logger.debug('Resting order added', {
                orderId,
                amount: remainingAmount.toString(),
            });
        }
        else {
            // Order fully filled - unlock any excess collateral
            // (collateral for unfilled portion)
            const filledCollateral = this.calculateRequiredCollateral(payload.side, payload.price, payload.amount - remainingAmount);
            const excessCollateral = requiredCollateral - filledCollateral;
            if (excessCollateral > 0n) {
                await this.stateManager.unlockBalance(userId, excessCollateral);
            }
        }
        // Record match
        this.stateManager.recordMatch();
        // Generate match ID
        const matchId = keccak256(toHex(`${orderId}:${timestamp}:${fills.length}`));
        // Get new root
        const newRoot = this.stateManager.getRoot();
        logger.info('Order processed', {
            orderId,
            fillCount: fills.length,
            remainingAmount: remainingAmount.toString(),
            newRoot,
            matchId,
        });
        return {
            fills,
            remainingAmount,
            newRoot,
            matchId,
            restingOrderAdded,
        };
    }
    /**
     * Execute a fill between maker and taker
     */
    async executeFill(makerOrder, takerOrderId, takerUserId, amount, price, timestamp) {
        // Determine share deltas
        // BUY order = buying shares (positive delta for buyer)
        // SELL order = selling shares (negative delta for seller)
        // Taker
        const takerShareDelta = makerOrder.side === 'SELL' ? amount : -amount;
        // Maker is opposite of taker
        const makerShareDelta = -takerShareDelta;
        // Update positions
        await this.positionManager.updatePosition(takerUserId, makerOrder.marketId, makerOrder.outcomeIndex, takerShareDelta, price);
        await this.positionManager.updatePosition(makerOrder.userId, makerOrder.marketId, makerOrder.outcomeIndex, makerShareDelta, price);
        // Update balances
        // Buyer pays: price * amount
        // Seller receives: price * amount
        const priceMultiplier = 1000000n;
        const priceScaled = BigInt(Math.round(price * Number(priceMultiplier)));
        const collateralTransfer = (amount * priceScaled) / priceMultiplier;
        if (takerShareDelta > 0n) {
            // Taker is buying - deduct locked collateral
            await this.stateManager.settleBalance(takerUserId, collateralTransfer, 0n);
            // Maker is selling - unlock and receive collateral
            await this.stateManager.settleBalance(makerOrder.userId, 0n, collateralTransfer);
        }
        else {
            // Taker is selling - unlock and receive collateral
            await this.stateManager.settleBalance(takerUserId, 0n, collateralTransfer);
            // Maker is buying - deduct locked collateral
            await this.stateManager.settleBalance(makerOrder.userId, collateralTransfer, 0n);
        }
        return {
            makerId: makerOrder.orderId,
            takerId: takerOrderId,
            makerUser: makerOrder.userId,
            takerUser: takerUserId,
            amount,
            price,
            timestamp,
        };
    }
    /**
     * Validate an order payload
     */
    validateOrder(payload) {
        // Check side
        if (payload.side !== 'BUY' && payload.side !== 'SELL') {
            return { valid: false, error: 'Invalid order side' };
        }
        // Check outcome index
        if (payload.outcomeIndex < 0 || payload.outcomeIndex > 9) {
            return { valid: false, error: 'Outcome index must be 0-9' };
        }
        // Check price range
        if (payload.price < 0.01 || payload.price > 0.99) {
            return { valid: false, error: 'Price must be between 0.01 and 0.99' };
        }
        // Check amount
        if (payload.amount <= 0n) {
            return { valid: false, error: 'Amount must be positive' };
        }
        // Check nonce
        if (payload.nonce < 0) {
            return { valid: false, error: 'Invalid nonce' };
        }
        return { valid: true };
    }
    /**
     * Check if taker price matches maker price
     */
    priceMatches(takerSide, takerPrice, makerPrice) {
        if (takerSide === 'BUY') {
            // Taker buying: willing to pay up to takerPrice
            // Maker selling: asking at least makerPrice
            // Match if taker's bid >= maker's ask
            return takerPrice >= makerPrice;
        }
        else {
            // Taker selling: willing to accept at least takerPrice
            // Maker buying: bidding at most makerPrice
            // Match if maker's bid >= taker's ask
            return makerPrice >= takerPrice;
        }
    }
    /**
     * Calculate required collateral for an order
     *
     * For buying shares: collateral = price * amount
     * For selling shares: collateral = (1 - price) * amount
     */
    calculateRequiredCollateral(side, price, amount) {
        const priceMultiplier = 1000000n;
        if (side === 'BUY') {
            // Buying shares costs price per share
            const priceScaled = BigInt(Math.round(price * Number(priceMultiplier)));
            return (amount * priceScaled) / priceMultiplier;
        }
        else {
            // Selling shares requires collateral for potential loss
            // Max loss is (1 - price) per share if outcome happens
            const inversePriceScaled = BigInt(Math.round((1 - price) * Number(priceMultiplier)));
            return (amount * inversePriceScaled) / priceMultiplier;
        }
    }
    /**
     * Cancel an order
     */
    async cancelOrder(orderId, userId) {
        const order = await this.orderBook.getOrder(orderId);
        if (!order) {
            return false;
        }
        // Verify ownership
        if (order.userId.toLowerCase() !== userId.toLowerCase()) {
            throw new OrderValidationError('Not order owner');
        }
        // Remove from order book
        await this.orderBook.removeOrder(orderId);
        // Unlock collateral for remaining amount
        const collateral = this.calculateRequiredCollateral(order.side, order.price, order.amount);
        await this.stateManager.unlockBalance(userId, collateral);
        logger.info('Order cancelled', { orderId, userId });
        return true;
    }
}
/**
 * Create a matcher instance
 */
export function createMatcher(orderBook, positionManager, stateManager) {
    return new Matcher(orderBook, positionManager, stateManager);
}
//# sourceMappingURL=matcher.js.map