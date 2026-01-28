/**
 * Position Manager
 *
 * Tracks user positions in market outcomes and handles settlement calculations.
 */

import type { Address, Hex } from 'viem';
import type { Position, SettlementResult } from '../types.js';
import type { PMTState } from '../state/pmtState.js';
import {
  encodePositionKey,
  decodePositionKey,
  getUserPositionsPrefix,
} from './priceEncoder.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PositionManager');

/**
 * Position Manager class
 */
export class PositionManager {
  constructor(private pmtState: PMTState) {}

  /**
   * Get a user's position for a specific market outcome
   */
  async getPosition(
    userId: Address,
    marketId: Hex,
    outcomeIndex: number
  ): Promise<Position | null> {
    const key = encodePositionKey(userId, marketId, outcomeIndex);
    return this.pmtState.getJSON<Position>(key);
  }

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
  async updatePosition(
    userId: Address,
    marketId: Hex,
    outcomeIndex: number,
    shareDelta: bigint,
    fillPrice: number
  ): Promise<{ position: Position; realizedPnL: bigint }> {
    const key = encodePositionKey(userId, marketId, outcomeIndex);
    let position = await this.getPosition(userId, marketId, outcomeIndex);
    let realizedPnL = 0n;

    if (!position) {
      // Create new position
      position = {
        userId,
        marketId,
        outcomeIndex,
        shares: 0n,
        avgEntryPrice: 0,
        realizedPnL: 0n,
      };
    }

    const currentShares = position.shares;
    const newShares = currentShares + shareDelta;

    // Calculate realized P&L if reducing position
    if (
      (currentShares > 0n && shareDelta < 0n) ||
      (currentShares < 0n && shareDelta > 0n)
    ) {
      // Position is being reduced or closed
      const closingAmount = shareDelta < 0n
        ? (shareDelta > -currentShares ? -shareDelta : currentShares)
        : (shareDelta < -currentShares ? shareDelta : -currentShares);

      // Calculate P&L: (exit price - entry price) * shares closed
      // For long: profit when exit > entry
      // For short: profit when exit < entry
      const priceMultiplier = 1_000_000n; // 6 decimal precision
      const entryPriceScaled = BigInt(Math.round(position.avgEntryPrice * Number(priceMultiplier)));
      const fillPriceScaled = BigInt(Math.round(fillPrice * Number(priceMultiplier)));

      if (currentShares > 0n) {
        // Closing long position
        realizedPnL = ((fillPriceScaled - entryPriceScaled) * closingAmount) / priceMultiplier;
      } else {
        // Closing short position
        realizedPnL = ((entryPriceScaled - fillPriceScaled) * closingAmount) / priceMultiplier;
      }

      position.realizedPnL += realizedPnL;
    }

    // Update average entry price
    if (newShares === 0n) {
      // Position fully closed
      position.avgEntryPrice = 0;
    } else if (
      (currentShares >= 0n && shareDelta > 0n) ||
      (currentShares <= 0n && shareDelta < 0n)
    ) {
      // Position is being increased in same direction
      // Weighted average of existing and new
      const absCurrentShares = currentShares >= 0n ? currentShares : -currentShares;
      const absShareDelta = shareDelta >= 0n ? shareDelta : -shareDelta;
      const totalShares = absCurrentShares + absShareDelta;

      if (totalShares > 0n) {
        position.avgEntryPrice =
          (position.avgEntryPrice * Number(absCurrentShares) +
            fillPrice * Number(absShareDelta)) /
          Number(totalShares);
      }
    } else if ((currentShares > 0n && newShares < 0n) || (currentShares < 0n && newShares > 0n)) {
      // Position flipped direction - new entry price is fill price
      position.avgEntryPrice = fillPrice;
    }

    position.shares = newShares;

    // Save or delete position
    if (newShares === 0n && position.realizedPnL === 0n) {
      // Clean up zero position with no realized P&L history
      await this.pmtState.del(key);
    } else {
      await this.pmtState.putJSON(key, position);
    }

    logger.debug('Position updated', {
      userId,
      marketId,
      outcomeIndex,
      shares: newShares.toString(),
      avgEntryPrice: position.avgEntryPrice,
      realizedPnL: realizedPnL.toString(),
    });

    return { position, realizedPnL };
  }

  /**
   * Get all positions for a user
   */
  async getUserPositions(userId: Address): Promise<Position[]> {
    const prefix = getUserPositionsPrefix(userId);
    const positions: Position[] = [];

    for await (const entry of this.pmtState.iteratePrefix(prefix)) {
      const position = await this.deserializePosition(entry.value);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Get all positions for a market (across all users)
   *
   * Note: This is expensive - consider maintaining a market-based index
   */
  async getMarketPositions(marketId: Hex): Promise<Position[]> {
    const positions: Position[] = [];

    // Need to scan all positions - inefficient
    // In production, maintain a market -> users index
    const prefix = 'user:';

    for await (const entry of this.pmtState.iteratePrefix(prefix)) {
      if (entry.key.includes(':position:')) {
        const position = await this.deserializePosition(entry.value);
        if (position && position.marketId === marketId) {
          positions.push(position);
        }
      }
    }

    return positions;
  }

  /**
   * Settle all positions for a resolved market
   *
   * @param marketId - Market ID
   * @param winningOutcome - The winning outcome index (255 = cancelled)
   * @param outcomeCount - Total number of outcomes in the market
   * @returns Array of settlement results with payouts
   */
  async settleMarket(
    marketId: Hex,
    winningOutcome: number,
    outcomeCount: number
  ): Promise<SettlementResult[]> {
    const results: SettlementResult[] = [];
    const positions = await this.getMarketPositions(marketId);

    logger.info('Settling market', {
      marketId,
      winningOutcome,
      positionCount: positions.length,
    });

    for (const position of positions) {
      // Skip zero positions
      if (position.shares === 0n) continue;

      const isWinner = position.outcomeIndex === winningOutcome;
      let payout = 0n;

      if (winningOutcome === 255) {
        // Market cancelled - return collateral at entry price
        const priceMultiplier = 1_000_000n;
        const entryPriceScaled = BigInt(Math.round(position.avgEntryPrice * Number(priceMultiplier)));
        payout = (position.shares * entryPriceScaled) / priceMultiplier;
        if (payout < 0n) payout = -payout; // Absolute value
      } else if (isWinner) {
        // Winner gets 1.0 per share
        payout = position.shares > 0n ? position.shares : 0n;
      } else {
        // Loser gets 0 per share
        payout = 0n;
      }

      results.push({
        userId: position.userId,
        marketId,
        outcomeIndex: position.outcomeIndex,
        shares: position.shares,
        payout,
        isWinner,
      });

      // Clear the position
      const key = encodePositionKey(position.userId, marketId, position.outcomeIndex);
      await this.pmtState.del(key);

      logger.debug('Position settled', {
        userId: position.userId,
        outcomeIndex: position.outcomeIndex,
        shares: position.shares.toString(),
        payout: payout.toString(),
        isWinner,
      });
    }

    return results;
  }

  /**
   * Calculate total exposure for a user in a market
   */
  async getUserMarketExposure(userId: Address, marketId: Hex): Promise<bigint> {
    const positions = await this.getUserPositions(userId);
    let totalExposure = 0n;

    for (const pos of positions) {
      if (pos.marketId === marketId) {
        // Exposure = shares * entry price
        const priceMultiplier = 1_000_000n;
        const entryPriceScaled = BigInt(Math.round(pos.avgEntryPrice * Number(priceMultiplier)));
        const exposure = (pos.shares * entryPriceScaled) / priceMultiplier;
        totalExposure += exposure > 0n ? exposure : -exposure;
      }
    }

    return totalExposure;
  }

  /**
   * Deserialize position from bytes
   */
  private async deserializePosition(data: Uint8Array): Promise<Position | null> {
    try {
      const text = new TextDecoder().decode(data);
      const obj = JSON.parse(text) as {
        userId: Address;
        marketId: Hex;
        outcomeIndex: number;
        shares: string;
        avgEntryPrice: number;
        realizedPnL: string;
      };

      return {
        userId: obj.userId,
        marketId: obj.marketId,
        outcomeIndex: obj.outcomeIndex,
        shares: BigInt(obj.shares),
        avgEntryPrice: obj.avgEntryPrice,
        realizedPnL: BigInt(obj.realizedPnL),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Create a position manager instance
 */
export function createPositionManager(pmtState: PMTState): PositionManager {
  return new PositionManager(pmtState);
}
