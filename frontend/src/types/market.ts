export interface Market {
  marketId: `0x${string}`;
  question: string;
  outcomes: string[];
  resolutionTime: bigint;
  winningOutcome: number;
  resolved: boolean;
  creator: `0x${string}`;
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
