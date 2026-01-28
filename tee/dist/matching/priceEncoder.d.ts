/**
 * Price encoding utilities for PMT key construction
 *
 * PMT keys are designed for lexicographic ordering to achieve price-time priority:
 * - Ask orders: Lower prices come first (ascending)
 * - Bid orders: Higher prices come first (descending via inverted encoding)
 *
 * Key format: market:{marketId}:outcome:{idx}:{side}:{encodedPrice}:{orderId}
 */
import type { Hex } from 'viem';
import type { OrderKeyComponents, OrderSide } from '../types.js';
/**
 * Validate price is within acceptable range
 */
export declare function validatePrice(price: number): void;
/**
 * Encode price for ASK orders (ascending sort = better prices first)
 *
 * @example encodePriceAsk(0.45) -> "0045"
 */
export declare function encodePriceAsk(price: number): string;
/**
 * Decode ASK price from encoded string
 *
 * @example decodePriceAsk("0045") -> 0.45
 */
export declare function decodePriceAsk(encoded: string): number;
/**
 * Encode price for BID orders (inverted for descending sort via ascending iteration)
 *
 * @example encodePriceBid(0.45) -> "9954" (9999 - 45 = 9954)
 */
export declare function encodePriceBid(price: number): string;
/**
 * Decode BID price from encoded string
 *
 * @example decodePriceBid("9954") -> 0.45 (9999 - 9954 = 45)
 */
export declare function decodePriceBid(encoded: string): number;
/**
 * Encode price based on side
 */
export declare function encodePrice(price: number, side: 'bid' | 'ask'): string;
/**
 * Decode price based on side
 */
export declare function decodePrice(encoded: string, side: 'bid' | 'ask'): number;
/**
 * Convert order side to PMT key side
 */
export declare function orderSideToKeyString(side: OrderSide): 'bid' | 'ask';
/**
 * Convert PMT key side to order side
 */
export declare function keySideToOrderSide(side: 'bid' | 'ask'): OrderSide;
/**
 * Construct a full order key for PMT storage
 *
 * Format: market:{marketId}:outcome:{idx}:{side}:{encodedPrice}:{orderId}
 */
export declare function encodeOrderKey(params: {
    marketId: Hex;
    outcomeIndex: number;
    side: 'bid' | 'ask';
    price: number;
    orderId: Hex;
}): string;
/**
 * Parse an order key back into its components
 */
export declare function decodeOrderKey(key: string): OrderKeyComponents;
/**
 * Get prefix for iterating orders in a specific market/outcome/side
 */
export declare function getOrderKeyPrefix(marketId: Hex, outcomeIndex: number, side: 'bid' | 'ask'): string;
/**
 * Construct a balance key for PMT storage
 *
 * Format: user:{address}:balance
 */
export declare function encodeBalanceKey(userId: string): string;
/**
 * Parse a balance key to extract user address
 */
export declare function decodeBalanceKey(key: string): string;
/**
 * Construct a position key for PMT storage
 *
 * Format: user:{address}:position:{marketId}:{outcomeIdx}
 */
export declare function encodePositionKey(userId: string, marketId: Hex, outcomeIndex: number): string;
/**
 * Parse a position key to extract components
 */
export declare function decodePositionKey(key: string): {
    userId: string;
    marketId: Hex;
    outcomeIndex: number;
};
/**
 * Get prefix for iterating all positions of a user
 */
export declare function getUserPositionsPrefix(userId: string): string;
/**
 * Get prefix for iterating all positions in a market
 */
export declare function getMarketPositionsPrefix(marketId: Hex): string;
/**
 * Construct a metadata key
 *
 * Format: meta:{key}
 */
export declare function encodeMetaKey(key: string): string;
/**
 * Decode a metadata key
 */
export declare function decodeMetaKey(fullKey: string): string;
//# sourceMappingURL=priceEncoder.d.ts.map