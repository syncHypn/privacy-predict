/**
 * Parses decoded event rows from Goldsky indexer tables.
 * Goldsky's _gs_log_decode() returns a struct with event_signature and event_params[].
 */

export interface IndexerEvent {
  id: string;
  event_signature: string;
  event_params: string[];
  block_number: number;
  block_timestamp: string;
  transaction_hash: string;
  log_index: number;
}

// ── MarketFactory events ──

export interface MarketCreatedEvent {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: bigint;
  creator: string;
  blockTimestamp: string;
  transactionHash: string;
}

export interface MarketResolvedEvent {
  marketId: string;
  winningOutcome: number;
  blockTimestamp: string;
  transactionHash: string;
}

export function parseMarketCreated(row: IndexerEvent): MarketCreatedEvent | null {
  if (!row.event_signature?.includes("MarketCreated")) return null;
  const p = row.event_params;
  return {
    marketId: p[0],
    question: p[1],
    outcomes: JSON.parse(p[2] || "[]"),
    resolutionTime: BigInt(p[3]),
    creator: p[4],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

export function parseMarketResolved(row: IndexerEvent): MarketResolvedEvent | null {
  if (!row.event_signature?.includes("MarketResolved")) return null;
  const p = row.event_params;
  return {
    marketId: p[0],
    winningOutcome: Number(p[1]),
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

// ── OrderQueue events ──

export interface OrderSubmittedEvent {
  orderId: string;
  marketId: string;
  user: string;
  encryptedPayload: string;
  timestamp: bigint;
  blockTimestamp: string;
  transactionHash: string;
}

export interface OrderCancelledEvent {
  orderId: string;
  user: string;
  blockTimestamp: string;
  transactionHash: string;
}

export function parseOrderSubmitted(row: IndexerEvent): OrderSubmittedEvent | null {
  if (!row.event_signature?.includes("OrderSubmitted")) return null;
  const p = row.event_params;
  return {
    orderId: p[0],
    marketId: p[1],
    user: p[2],
    encryptedPayload: p[3],
    timestamp: BigInt(p[4]),
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

export function parseOrderCancelled(row: IndexerEvent): OrderCancelledEvent | null {
  if (!row.event_signature?.includes("OrderCancelled")) return null;
  const p = row.event_params;
  return {
    orderId: p[0],
    user: p[1],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

// ── PrivateToken events ──

export interface DepositEvent {
  user: string;
  amount: string;
  commitment: string;
  blockTimestamp: string;
  transactionHash: string;
}

export interface WithdrawalRequestedEvent {
  user: string;
  commitmentHash: string;
  blockTimestamp: string;
  transactionHash: string;
}

export interface WithdrawalProcessedEvent {
  user: string;
  amount: string;
  blockTimestamp: string;
  transactionHash: string;
}

export function parseDeposit(row: IndexerEvent): DepositEvent | null {
  if (!row.event_signature?.includes("Deposit")) return null;
  const p = row.event_params;
  return {
    user: p[0],
    amount: p[1],
    commitment: p[2],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

export function parseWithdrawalRequested(row: IndexerEvent): WithdrawalRequestedEvent | null {
  if (!row.event_signature?.includes("WithdrawalRequested")) return null;
  const p = row.event_params;
  return {
    user: p[0],
    commitmentHash: p[1],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

export function parseWithdrawalProcessed(row: IndexerEvent): WithdrawalProcessedEvent | null {
  if (!row.event_signature?.includes("WithdrawalProcessed")) return null;
  const p = row.event_params;
  return {
    user: p[0],
    amount: p[1],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}

// ── StateAnchor events ──

export interface StateUpdatedEvent {
  version: bigint;
  newRoot: string;
  previousRoot: string;
  matchId: string;
  blockTimestamp: string;
  transactionHash: string;
}

export function parseStateUpdated(row: IndexerEvent): StateUpdatedEvent | null {
  if (!row.event_signature?.includes("StateUpdated")) return null;
  const p = row.event_params;
  return {
    version: BigInt(p[0]),
    newRoot: p[1],
    previousRoot: p[2],
    matchId: p[3],
    blockTimestamp: row.block_timestamp,
    transactionHash: row.transaction_hash,
  };
}
