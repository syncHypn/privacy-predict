/**
 * Oracle Client
 *
 * Handles market resolution when oracle submits winning outcome.
 * Integrates with ESPN API for sports data (future implementation).
 */
import { createLogger } from '../utils/logger.js';
const logger = createLogger('OracleClient');
/**
 * Oracle Client class
 */
export class OracleClient {
    positionManager;
    stateManager;
    contractCaller;
    constructor(positionManager, stateManager, contractCaller) {
        this.positionManager = positionManager;
        this.stateManager = stateManager;
        this.contractCaller = contractCaller;
    }
    /**
     * Handle market resolution event
     *
     * Processes all positions in the market and settles them based on the winning outcome.
     */
    async handleMarketResolution(event) {
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
        const results = await this.positionManager.settleMarket(event.marketId, event.winningOutcome, market.outcomes.length);
        // Update balances based on settlements
        const balanceUpdates = new Map();
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
    async prepareBatchUpdate(settlements) {
        // Group settlements by user
        const userBalances = new Map();
        for (const settlement of settlements) {
            const current = userBalances.get(settlement.userId) ?? 0n;
            userBalances.set(settlement.userId, current + settlement.payout);
        }
        // Get current balances and prepare encrypted versions
        const users = [];
        const encryptedBalances = [];
        for (const [userId] of userBalances) {
            const balance = await this.stateManager.getBalance(userId);
            users.push(userId);
            // For on-chain, we send a commitment/encrypted representation
            // In MVP, we use a simple encoding
            const balanceData = JSON.stringify({
                available: balance.available.toString(),
                locked: balance.locked.toString(),
            });
            const encrypted = this.stateManager.encryptData(new TextEncoder().encode(balanceData));
            encryptedBalances.push(('0x' + Buffer.from(encrypted).toString('hex')));
        }
        return {
            users,
            encryptedBalances,
            stateRoot: this.stateManager.getRoot(),
        };
    }
}
/**
 * Mock ESPN client for development
 */
export class MockESPNClient {
    async getMatchResult(matchId) {
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
export function createOracleClient(positionManager, stateManager, contractCaller) {
    return new OracleClient(positionManager, stateManager, contractCaller);
}
//# sourceMappingURL=oracleClient.js.map