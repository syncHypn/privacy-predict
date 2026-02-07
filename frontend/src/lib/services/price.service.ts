import { getDb } from "../db";
import { parsePricesUpdated } from "./indexer-parser";
import type { IndexerEvent } from "./indexer-parser";

export interface PricePoint {
  timestamp: string;
  yesPrice: number;
  noPrice: number;
}

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

const RANGE_INTERVALS: Record<TimeRange, string> = {
  "1H": "1 hour",
  "6H": "6 hours",
  "1D": "1 day",
  "1W": "7 days",
  "1M": "30 days",
  ALL: "10 years",
};

export async function getPriceHistory(
  marketId: string,
  range: TimeRange = "ALL"
): Promise<PricePoint[]> {
  const sql = getDb();
  const interval = RANGE_INTERVALS[range] || RANGE_INTERVALS.ALL;

  // Read PricesUpdated events from Goldsky-indexed callback_receiver_events
  let rows: IndexerEvent[] = [];
  try {
    rows = (await sql`
      SELECT * FROM indexer.callback_receiver_events
      WHERE event_signature LIKE '%PricesUpdated%'
        AND block_timestamp >= now() - ${interval}::interval
      ORDER BY block_timestamp ASC
    `) as unknown as IndexerEvent[];
  } catch {
    // table may not exist yet before Goldsky indexes
  }

  return rows
    .map(parsePricesUpdated)
    .filter(Boolean)
    .filter((e) => e!.marketId.toLowerCase() === marketId.toLowerCase())
    .map((e) => ({
      timestamp: new Date(e!.blockTimestamp).toISOString(),
      yesPrice: e!.yesPrice,
      noPrice: e!.noPrice,
    }));
}
