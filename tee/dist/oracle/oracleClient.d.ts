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
/**
 * Oracle Client class
 */
export declare class OracleClient {
    private positionManager;
    private stateManager;
    private contractCaller;
    constructor(positionManager: PositionManager, stateManager: StateManager, contractCaller: ContractCaller);
    /**
     * Handle market resolution event
     *
     * Processes all positions in the market and settles them based on the winning outcome.
     */
    handleMarketResolution(event: MarketResolvedEvent): Promise<SettlementResult[]>;
    /**
     * Prepare batch balance updates for on-chain submission
     */
    prepareBatchUpdate(settlements: SettlementResult[]): Promise<{
        users: Address[];
        encryptedBalances: Hex[];
        stateRoot: Hex;
    }>;
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
export declare class MockESPNClient implements ESPNClient {
    getMatchResult(matchId: string): Promise<{
        homeScore: number;
        awayScore: number;
        status: 'final' | 'in_progress' | 'scheduled';
    }>;
}
/**
 * Create an oracle client instance
 */
export declare function createOracleClient(positionManager: PositionManager, stateManager: StateManager, contractCaller: ContractCaller): OracleClient;
//# sourceMappingURL=oracleClient.d.ts.map