import { getDb } from "../db";

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

export async function insertPriceSnapshot(
  marketId: string,
  yesPrice: number,
  noPrice: number
) {
  const sql = getDb();
  await sql`
    INSERT INTO price_snapshots (market_id, timestamp, yes_price, no_price)
    VALUES (${marketId}, now(), ${yesPrice}, ${noPrice})
  `;
}

export async function getPriceHistory(
  marketId: string,
  range: TimeRange = "ALL"
): Promise<PricePoint[]> {
  const sql = getDb();
  const interval = RANGE_INTERVALS[range] || RANGE_INTERVALS.ALL;

  const rows = await sql`
    SELECT timestamp, yes_price, no_price
    FROM price_snapshots
    WHERE market_id = ${marketId}
      AND timestamp >= now() - ${interval}::interval
    ORDER BY timestamp ASC
  `;

  return rows.map((r) => ({
    timestamp: new Date(r.timestamp).toISOString(),
    yesPrice: r.yes_price,
    noPrice: r.no_price,
  }));
}
