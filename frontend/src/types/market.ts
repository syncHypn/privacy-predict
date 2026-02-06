export interface Market {
  marketId: `0x${string}`;
  question: string;
  outcomes: string[];
  resolutionTime: bigint;
  winningOutcome: number;
  resolved: boolean;
  creator: `0x${string}`;
}

/** Enriched market from API (includes metadata + stats) */
export interface EnrichedMarket {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: string; // ISO string
  winningOutcome: number;
  resolved: boolean;
  creator: string;
  transactionHash: string;
  // metadata
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  featured: boolean;
  // stats
  orderCount: number;
  totalVolume: string;
  uniqueTraders: number;
  lastOrderAt: string | null;
  // latest price
  yesPrice: number;
  noPrice: number;
}

export interface EncryptedOrder {
  orderId: `0x${string}`;
  marketId: `0x${string}`;
  user: `0x${string}`;
  encryptedPayload: `0x${string}`;
  timestamp: bigint;
}

export interface OrderPayload {
  side: "BUY" | "SELL";
  outcomeIndex: number;
  amount: string;
  nonce: number;
  timestamp: number;
}

/** Order from API (includes tx hash + cancellation status) */
export interface EnrichedOrder {
  orderId: string;
  marketId: string;
  user: string;
  encryptedPayload: string;
  timestamp: string;
  blockTimestamp: string;
  transactionHash: string;
  cancelled: boolean;
}
