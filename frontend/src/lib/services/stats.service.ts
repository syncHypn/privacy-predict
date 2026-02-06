import { getDb } from "../db";

export interface OverviewStats {
  totalMarkets: number;
  totalOrders: number;
  totalVolume: string;
  latestStateVersion: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const sql = getDb();

  const [marketsResult, ordersResult, stateResult] = await Promise.all([
    sql`
      SELECT COUNT(*) as count FROM indexer.market_factory_events
      WHERE event_signature LIKE '%MarketCreated%'
    `,
    sql`
      SELECT COUNT(*) as count FROM indexer.order_queue_events
      WHERE event_signature LIKE '%OrderSubmitted%'
    `,
    sql`
      SELECT MAX(block_number) as latest FROM indexer.state_anchor_events
      WHERE event_signature LIKE '%StateUpdated%'
    `,
  ]);

  // Sum up volume from market_stats
  const volumeResult = await sql`
    SELECT COALESCE(SUM(total_volume::numeric), 0)::text as total FROM market_stats
  `;

  return {
    totalMarkets: Number(marketsResult[0]?.count ?? 0),
    totalOrders: Number(ordersResult[0]?.count ?? 0),
    totalVolume: volumeResult[0]?.total ?? "0",
    latestStateVersion: Number(stateResult[0]?.latest ?? 0),
  };
}
