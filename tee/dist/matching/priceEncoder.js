/**
 * Price encoding utilities for PMT key construction
 *
 * PMT keys are designed for lexicographic ordering to achieve price-time priority:
 * - Ask orders: Lower prices come first (ascending)
 * - Bid orders: Higher prices come first (descending via inverted encoding)
 *
 * Key format: market:{marketId}:outcome:{idx}:{side}:{encodedPrice}:{orderId}
 */
/** Price must be between 0.01 and 0.99 */
const MIN_PRICE = 0.01;
const MAX_PRICE = 0.99;
const PRICE_MULTIPLIER = 100;
const PRICE_MAX_ENCODED = 9999;
/**
 * Validate price is within acceptable range
 */
export function validatePrice(price) {
    if (price < MIN_PRICE || price > MAX_PRICE) {
        throw new Error(`Price must be between ${MIN_PRICE} and ${MAX_PRICE}, got ${price}`);
    }
}
/**
 * Encode price for ASK orders (ascending sort = better prices first)
 *
 * @example encodePriceAsk(0.45) -> "0045"
 */
export function encodePriceAsk(price) {
    validatePrice(price);
    const encoded = Math.round(price * PRICE_MULTIPLIER);
    return encoded.toString().padStart(4, '0');
}
/**
 * Decode ASK price from encoded string
 *
 * @example decodePriceAsk("0045") -> 0.45
 */
export function decodePriceAsk(encoded) {
    const value = parseInt(encoded, 10);
    return value / PRICE_MULTIPLIER;
}
/**
 * Encode price for BID orders (inverted for descending sort via ascending iteration)
 *
 * @example encodePriceBid(0.45) -> "9954" (9999 - 45 = 9954)
 */
export function encodePriceBid(price) {
    validatePrice(price);
    const encoded = PRICE_MAX_ENCODED - Math.round(price * PRICE_MULTIPLIER);
    return encoded.toString().padStart(4, '0');
}
/**
 * Decode BID price from encoded string
 *
 * @example decodePriceBid("9954") -> 0.45 (9999 - 9954 = 45)
 */
export function decodePriceBid(encoded) {
    const value = parseInt(encoded, 10);
    return (PRICE_MAX_ENCODED - value) / PRICE_MULTIPLIER;
}
/**
 * Encode price based on side
 */
export function encodePrice(price, side) {
    return side === 'ask' ? encodePriceAsk(price) : encodePriceBid(price);
}
/**
 * Decode price based on side
 */
export function decodePrice(encoded, side) {
    return side === 'ask' ? decodePriceAsk(encoded) : decodePriceBid(encoded);
}
/**
 * Convert order side to PMT key side
 */
export function orderSideToKeyString(side) {
    return side === 'BUY' ? 'bid' : 'ask';
}
/**
 * Convert PMT key side to order side
 */
export function keySideToOrderSide(side) {
    return side === 'bid' ? 'BUY' : 'SELL';
}
/**
 * Construct a full order key for PMT storage
 *
 * Format: market:{marketId}:outcome:{idx}:{side}:{encodedPrice}:{orderId}
 */
export function encodeOrderKey(params) {
    const { marketId, outcomeIndex, side, price, orderId } = params;
    if (outcomeIndex < 0 || outcomeIndex > 9) {
        throw new Error(`Outcome index must be 0-9, got ${outcomeIndex}`);
    }
    const encodedPrice = encodePrice(price, side);
    return `market:${marketId}:outcome:${outcomeIndex}:${side}:${encodedPrice}:${orderId}`;
}
/**
 * Parse an order key back into its components
 */
export function decodeOrderKey(key) {
    const parts = key.split(':');
    if (parts.length !== 7) {
        throw new Error(`Invalid order key format: ${key}`);
    }
    const [prefix1, marketId, prefix2, outcomeStr, side, encodedPrice, orderId] = parts;
    if (prefix1 !== 'market' || prefix2 !== 'outcome') {
        throw new Error(`Invalid order key format: ${key}`);
    }
    if (side !== 'bid' && side !== 'ask') {
        throw new Error(`Invalid side in key: ${side}`);
    }
    const outcomeIndex = parseInt(outcomeStr ?? '', 10);
    if (isNaN(outcomeIndex) || outcomeIndex < 0 || outcomeIndex > 9) {
        throw new Error(`Invalid outcome index: ${outcomeStr}`);
    }
    return {
        marketId: marketId,
        outcomeIndex,
        side,
        encodedPrice: encodedPrice ?? '',
        orderId: orderId,
    };
}
/**
 * Get prefix for iterating orders in a specific market/outcome/side
 */
export function getOrderKeyPrefix(marketId, outcomeIndex, side) {
    return `market:${marketId}:outcome:${outcomeIndex}:${side}:`;
}
/**
 * Construct a balance key for PMT storage
 *
 * Format: user:{address}:balance
 */
export function encodeBalanceKey(userId) {
    return `user:${userId.toLowerCase()}:balance`;
}
/**
 * Parse a balance key to extract user address
 */
export function decodeBalanceKey(key) {
    const parts = key.split(':');
    if (parts.length !== 3 || parts[0] !== 'user' || parts[2] !== 'balance') {
        throw new Error(`Invalid balance key format: ${key}`);
    }
    return parts[1] ?? '';
}
/**
 * Construct a position key for PMT storage
 *
 * Format: user:{address}:position:{marketId}:{outcomeIdx}
 */
export function encodePositionKey(userId, marketId, outcomeIndex) {
    return `user:${userId.toLowerCase()}:position:${marketId}:${outcomeIndex}`;
}
/**
 * Parse a position key to extract components
 */
export function decodePositionKey(key) {
    const parts = key.split(':');
    if (parts.length !== 5 || parts[0] !== 'user' || parts[2] !== 'position') {
        throw new Error(`Invalid position key format: ${key}`);
    }
    const outcomeIndex = parseInt(parts[4] ?? '', 10);
    if (isNaN(outcomeIndex)) {
        throw new Error(`Invalid outcome index in position key: ${key}`);
    }
    return {
        userId: parts[1] ?? '',
        marketId: parts[3],
        outcomeIndex,
    };
}
/**
 * Get prefix for iterating all positions of a user
 */
export function getUserPositionsPrefix(userId) {
    return `user:${userId.toLowerCase()}:position:`;
}
/**
 * Get prefix for iterating all positions in a market
 */
export function getMarketPositionsPrefix(marketId) {
    // This requires a separate index since positions are keyed by user
    // For market-wide iteration, we'll use a secondary index
    return `market-positions:${marketId}:`;
}
/**
 * Construct a metadata key
 *
 * Format: meta:{key}
 */
export function encodeMetaKey(key) {
    return `meta:${key}`;
}
/**
 * Decode a metadata key
 */
export function decodeMetaKey(fullKey) {
    const parts = fullKey.split(':');
    if (parts.length !== 2 || parts[0] !== 'meta') {
        throw new Error(`Invalid meta key format: ${fullKey}`);
    }
    return parts[1] ?? '';
}
//# sourceMappingURL=priceEncoder.js.map