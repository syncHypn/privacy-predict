/**
 * Core TypeScript interfaces for iPred TEE Matching Engine
 */

import type { Address, Hex } from 'viem';

// ============================================================================
// Order Types
// ============================================================================

/** Order side - BUY means buying outcome shares, SELL means selling */
export type OrderSide = 'BUY' | 'SELL';

/** Order status in the order book */
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';

/**
 * Decrypted order payload from user submission
 * This is what the user encrypts with TEE public key
 */
export interface OrderPayload {
  /** Buy or sell */
  side: OrderSide;
  /** Which outcome (0-indexed) */
  outcomeIndex: number;
  /** Price between 0.01 and 0.99 */
  price: number;
  /** Collateral amount in base units (USDC 6 decimals) */
  amount: bigint;
  /** Unique nonce to prevent replay */
  nonce: number;
  /** User's public key for encrypted response */
  userPublicKey: Uint8Array;
}

/**
 * Order value stored in PMT
 */
export interface OrderValue {
  /** Unique order ID (bytes32 hex) */
  orderId: Hex;
  /** User address */
  userId: Address;
  /** Market ID (bytes32 hex) */
  marketId: Hex;
  /** Outcome index (0-9) */
  outcomeIndex: number;
  /** Order side */
  side: OrderSide;
  /** Limit price (0.01 - 0.99) */
  price: number;
  /** Remaining amount to fill */
  amount: bigint;
  /** Original order amount */
  originalAmount: bigint;
  /** Submission timestamp (ms) */
  timestamp: number;
  /** Current status */
  status: OrderStatus;
}

// ============================================================================
// Position Types
// ============================================================================

/**
 * User position in a market outcome
 */
export interface Position {
  /** User address */
  userId: Address;
  /** Market ID */
  marketId: Hex;
  /** Outcome index */
  outcomeIndex: number;
  /** Number of shares (positive = long, negative = short) */
  shares: bigint;
  /** Average entry price */
  avgEntryPrice: number;
  /** Realized P&L from closed portions */
  realizedPnL: bigint;
}

// ============================================================================
// Balance Types
// ============================================================================

/**
 * User balance stored in PMT (encrypted when stored)
 */
export interface UserBalance {
  /** Available for trading */
  available: bigint;
  /** Locked in open orders */
  locked: bigint;
}

// ============================================================================
// Match Types
// ============================================================================

/**
 * A single fill between two orders
 */
export interface Fill {
  /** Resting order ID */
  makerId: Hex;
  /** Incoming order ID */
  takerId: Hex;
  /** Maker user address */
  makerUser: Address;
  /** Taker user address */
  takerUser: Address;
  /** Fill amount in shares */
  amount: bigint;
  /** Execution price */
  price: number;
  /** Execution timestamp */
  timestamp: number;
}

/**
 * Result of processing an incoming order
 */
export interface MatchResult {
  /** List of fills that occurred */
  fills: Fill[];
  /** Any remaining unfilled amount */
  remainingAmount: bigint;
  /** New PMT root after this match */
  newRoot: Hex;
  /** Unique identifier for this match batch */
  matchId: Hex;
  /** Whether a resting order was added */
  restingOrderAdded: boolean;
}

// ============================================================================
// Market Types
// ============================================================================

/**
 * Market data from MarketFactory
 */
export interface Market {
  marketId: Hex;
  question: string;
  outcomes: string[];
  resolutionTime: bigint;
  winningOutcome: number;
  resolved: boolean;
  creator: Address;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * OrderSubmitted event from OrderQueue contract
 */
export interface OrderSubmittedEvent {
  orderId: Hex;
  marketId: Hex;
  user: Address;
  encryptedPayload: Hex;
  timestamp: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * OrderCancelled event from OrderQueue contract
 */
export interface OrderCancelledEvent {
  orderId: Hex;
  user: Address;
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * Deposit event from PrivateToken contract
 */
export interface DepositEvent {
  user: Address;
  amount: bigint;
  commitment: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * WithdrawalRequested event from PrivateToken contract
 */
export interface WithdrawalRequestedEvent {
  user: Address;
  commitmentHash: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * MarketResolved event from MarketFactory contract
 */
export interface MarketResolvedEvent {
  marketId: Hex;
  winningOutcome: number;
  blockNumber: bigint;
  transactionHash: Hex;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * TEE operational mode
 */
export type TEEMode = 'NORMAL' | 'READ_ONLY' | 'PAUSED' | 'MAINTENANCE';

/**
 * Metadata stored in PMT
 */
export interface StateMetadata {
  /** Last processed block number */
  lastProcessedBlock: bigint;
  /** Current state version */
  stateVersion: number;
  /** TEE operational mode */
  mode: TEEMode;
  /** Last snapshot IPFS CID */
  lastSnapshotCid?: string;
  /** Last snapshot state version */
  lastSnapshotVersion?: number;
}

/**
 * Settlement result for a single user position
 */
export interface SettlementResult {
  userId: Address;
  marketId: Hex;
  outcomeIndex: number;
  shares: bigint;
  payout: bigint;
  isWinner: boolean;
}

// ============================================================================
// PMT Key Types
// ============================================================================

/** Types of keys stored in PMT */
export type PMTKeyType = 'order' | 'balance' | 'position' | 'meta';

/**
 * Parsed components of an order key
 */
export interface OrderKeyComponents {
  marketId: Hex;
  outcomeIndex: number;
  side: 'bid' | 'ask';
  encodedPrice: string;
  orderId: Hex;
}

// ============================================================================
// Proof Types
// ============================================================================

/**
 * Merkle proof for a PMT key
 */
export interface MerkleProof {
  /** Key being proved */
  key: Uint8Array;
  /** Value at key (null if non-existent) */
  value: Uint8Array | null;
  /** Proof nodes */
  proof: Uint8Array[];
  /** Root the proof is against */
  root: Hex;
  /** State version */
  stateVersion: number;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Public spread for a market outcome
 */
export interface Spread {
  marketId: Hex;
  outcomeIndex: number;
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
}

/**
 * TEE public information
 */
export interface TEEInfo {
  publicKey: Hex;
  address: Address;
  attestation: Hex;
  stateVersion: number;
  currentRoot: Hex;
  mode: TEEMode;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Contract addresses
 */
export interface ContractAddresses {
  orderQueue: Address;
  stateAnchor: Address;
  privateToken: Address;
  marketFactory: Address;
}

/**
 * Application configuration
 */
export interface AppConfig {
  rpcUrls: string[];
  contracts: ContractAddresses;
  ipfs: {
    apiUrl: string;
    projectId?: string;
    projectSecret?: string;
  };
  pollingIntervalMs: number;
  snapshotIntervalMatches: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
