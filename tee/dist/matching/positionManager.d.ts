/**
 * Position Manager
 *
 * Tracks user positions in market outcomes and handles settlement calculations.
 */
import type { Address, Hex } from 'viem';
import type { Position, SettlementResult } from '../types.js';
import type { PMTState } from '../state/pmtState.js';
/**
 * Position Manager class
 */
export declare class PositionManager {
    private pmtState;
    constructor(pmtState: PMTState);
    /**
     * Get a user's position for a specific market outcome
     */
    getPosition(userId: Address, marketId: Hex, outcomeIndex: number): Promise<Position | null>;
    /**
     * Update a position after a trade fill
     *
     * @param userId - User address
     * @param marketId - Market ID
     * @param outcomeIndex - Outcome index
     * @param shareDelta - Change in shares (positive = add, negative = reduce)
     * @param fillPrice - Price at which the fill occurred
     * @returns Updated position and any realized P&L
     */
    updatePosition(userId: Address, marketId: Hex, outcomeIndex: number, shareDelta: bigint, fillPrice: number): Promise<{
        position: Position;
        realizedPnL: bigint;
    }>;
    /**
     * Get all positions for a user
     */
    getUserPositions(userId: Address): Promise<Position[]>;
    /**
     * Get all positions for a market (across all users)
     *
     * Note: This is expensive - consider maintaining a market-based index
     */
    getMarketPositions(marketId: Hex): Promise<Position[]>;
    /**
     * Settle all positions for a resolved market
     *
     * @param marketId - Market ID
     * @param winningOutcome - The winning outcome index (255 = cancelled)
     * @param outcomeCount - Total number of outcomes in the market
     * @returns Array of settlement results with payouts
     */
    settleMarket(marketId: Hex, winningOutcome: number, outcomeCount: number): Promise<SettlementResult[]>;
    /**
     * Calculate total exposure for a user in a market
     */
    getUserMarketExposure(userId: Address, marketId: Hex): Promise<bigint>;
    /**
     * Deserialize position from bytes
     */
    private deserializePosition;
}
/**
 * Create a position manager instance
 */
export declare function createPositionManager(pmtState: PMTState): PositionManager;
//# sourceMappingURL=positionManager.d.ts.map