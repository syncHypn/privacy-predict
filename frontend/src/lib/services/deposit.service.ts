import { getDb } from "../db";
import {
  parseDeposit,
  parseWithdrawalRequested,
  parseWithdrawalProcessed,
  type IndexerEvent,
  type DepositEvent,
  type WithdrawalProcessedEvent,
} from "./indexer-parser";

export interface DepositRecord {
  type: "deposit";
  user: string;
  amount: string; // raw USDC (6 decimals)
  transactionHash: string;
  blockTimestamp: string;
}

export interface WithdrawalRecord {
  type: "withdrawal_requested" | "withdrawal_processed";
  user: string;
  amount: string | null; // null for requested (encrypted), has value for processed
  transactionHash: string;
  blockTimestamp: string;
}

export type TransferRecord = DepositRecord | WithdrawalRecord;

export interface UserTransfers {
  transfers: TransferRecord[];
  totalDeposited: string; // sum of deposits in raw USDC
  totalWithdrawn: string; // sum of processed withdrawals in raw USDC
  netDeposited: string; // total deposited - total withdrawn
}

export async function getUserTransfers(
  user: string
): Promise<UserTransfers> {
  const sql = getDb();
  const userLower = user.toLowerCase();

  const rows = (await sql`
    SELECT * FROM indexer.private_token_events
    WHERE event_params[1] = ${userLower}
    ORDER BY block_number ASC
  `) as unknown as IndexerEvent[];

  const transfers: TransferRecord[] = [];
  let totalDeposited = BigInt(0);
  let totalWithdrawn = BigInt(0);

  for (const row of rows) {
    const deposit = parseDeposit(row);
    if (deposit) {
      totalDeposited += BigInt(deposit.amount);
      transfers.push({
        type: "deposit",
        user: deposit.user,
        amount: deposit.amount,
        transactionHash: deposit.transactionHash,
        blockTimestamp: deposit.blockTimestamp,
      });
      continue;
    }

    const wReq = parseWithdrawalRequested(row);
    if (wReq) {
      transfers.push({
        type: "withdrawal_requested",
        user: wReq.user,
        amount: null,
        transactionHash: wReq.transactionHash,
        blockTimestamp: wReq.blockTimestamp,
      });
      continue;
    }

    const wProc = parseWithdrawalProcessed(row);
    if (wProc) {
      totalWithdrawn += BigInt(wProc.amount);
      transfers.push({
        type: "withdrawal_processed",
        user: wProc.user,
        amount: wProc.amount,
        transactionHash: wProc.transactionHash,
        blockTimestamp: wProc.blockTimestamp,
      });
    }
  }

  // Reverse so newest first
  transfers.reverse();

  return {
    transfers,
    totalDeposited: totalDeposited.toString(),
    totalWithdrawn: totalWithdrawn.toString(),
    netDeposited: (totalDeposited - totalWithdrawn).toString(),
  };
}
