/**
 * Oracle Client
 *
 * Handles market resolution when oracle submits winning outcome.
 * Integrates with ESPN API for sports data (future implementation).
 */

import type { Address, Hex } from 'viem';
import type { MarketResolvedEvent, SettlementResult } from '../types.js';
import type { PositionManager } from '../matching/positionManager.js';
import type { StateManager } from '../state/stateManager.js';
import type { ContractCaller } from '../blockchain/contractCaller.js';
import { createLogger } from '../utils/logger.js';
import { encodeBase64 } from '../crypto/encryption.js';

const logger = createLogger('OracleClient');

/**
 * Oracle Client class
 */
export class OracleClient {
  constructor(
    private positionManager: PositionManager,
    private stateManager: StateManager,
    private contractCaller: ContractCaller
  ) {}

  /**
   * Handle market resolution event
   *
   * Processes all positions in the market and settles them based on the winning outcome.
   */
  async handleMarketResolution(event: MarketResolvedEvent): Promise<SettlementResult[]> {
    logger.info('Handling market resolution', {
      marketId: event.marketId,
      winningOutcome: event.winningOutcome,
      blockNumber: event.blockNumber.toString(),
    });

    // Get market details to know outcome count
    const market = await this.contractCaller.getMarket(event.marketId);

    if (!market.resolved) {
      logger.warn('Market not resolved on-chain yet', { marketId: event.marketId });
      return [];
    }

    // Settle all positions
    const results = await this.positionManager.settleMarket(
      event.marketId,
      event.winningOutcome,
      market.outcomes.length
    );

    // Update balances based on settlements
    const balanceUpdates = new Map<Address, bigint>();

    for (const result of results) {
      const current = balanceUpdates.get(result.userId) ?? 0n;
      balanceUpdates.set(result.userId, current + result.payout);
    }

    // Apply balance updates
    for (const [userId, payout] of balanceUpdates) {
      if (payout > 0n) {
        await this.stateManager.addAvailableBalance(userId, payout);
      }
    }

    // Increment state version
    this.stateManager.incrementVersion();

    logger.info('Market settled', {
      marketId: event.marketId,
      settledPositions: results.length,
      totalPayout: Array.from(balanceUpdates.values())
        .reduce((a, b) => a + b, 0n)
        .toString(),
    });

    return results;
  }

  /**
   * Prepare batch balance updates for on-chain submission
   */
  async prepareBatchUpdate(settlements: SettlementResult[]): Promise<{
    users: Address[];
    encryptedBalances: Hex[];
    stateRoot: Hex;
  }> {
    // Group settlements by user
    const userBalances = new Map<Address, bigint>();

    for (const settlement of settlements) {
      const current = userBalances.get(settlement.userId) ?? 0n;
      userBalances.set(settlement.userId, current + settlement.payout);
    }

    // Get current balances and prepare encrypted versions
    const users: Address[] = [];
    const encryptedBalances: Hex[] = [];

    for (const [userId] of userBalances) {
      const balance = await this.stateManager.getBalance(userId);
      users.push(userId);

      // For on-chain, we send a commitment/encrypted representation
      // In MVP, we use a simple encoding
      const balanceData = JSON.stringify({
        available: balance.available.toString(),
        locked: balance.locked.toString(),
      });
      const encrypted = this.stateManager.encryptData(
        new TextEncoder().encode(balanceData)
      );
      encryptedBalances.push(('0x' + Buffer.from(encrypted).toString('hex')) as Hex);
    }

    return {
      users,
      encryptedBalances,
      stateRoot: this.stateManager.getRoot(),
    };
  }
}

/**
 * ESPN API client interface (for future implementation)
 */
export interface ESPNClient {
  getMatchResult(matchId: string): Promise<{
    homeScore: number;
    awayScore: number;
    status: 'final' | 'in_progress' | 'scheduled';
  }>;
}

/**
 * Mock ESPN client for development
 */
export class MockESPNClient implements ESPNClient {
  async getMatchResult(matchId: string): Promise<{
    homeScore: number;
    awayScore: number;
    status: 'final' | 'in_progress' | 'scheduled';
  }> {
    logger.debug('Mock ESPN API called', { matchId });

    // Return mock data
    return {
      homeScore: 2,
      awayScore: 1,
      status: 'final',
    };
  }
}

/**
 * Create an oracle client instance
 */
export function createOracleClient(
  positionManager: PositionManager,
  stateManager: StateManager,
  contractCaller: ContractCaller
): OracleClient {
  return new OracleClient(positionManager, stateManager, contractCaller);
}
