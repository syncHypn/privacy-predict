import { getDb } from "../db";
import { parseMarketCreated, parseMarketResolved, parsePricesUpdated } from "./indexer-parser";
import type { IndexerEvent } from "./indexer-parser";

export interface MarketWithMeta {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: string; // ISO string for JSON serialization
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

export async function getMarkets(filters?: {
  category?: string;
  featured?: boolean;
  status?: "open" | "resolved" | "expired";
}): Promise<MarketWithMeta[]> {
  const sql = getDb();

  // Fetch all market events from indexer
  const createdRows = (await sql`
    SELECT * FROM indexer.market_factory_events
    WHERE event_signature LIKE '%MarketCreated%'
    ORDER BY block_number ASC
  `) as unknown as IndexerEvent[];

  const resolvedRows = (await sql`
    SELECT * FROM indexer.market_factory_events
    WHERE event_signature LIKE '%MarketResolved%'
  `) as unknown as IndexerEvent[];

  const created = createdRows.map(parseMarketCreated).filter(Boolean);
  const resolvedMap = new Map(
    resolvedRows.map(parseMarketResolved).filter(Boolean).map((r) => [r!.marketId, r!])
  );

  const marketIds = created.map((c) => c!.marketId);
  if (marketIds.length === 0) return [];

  // Fetch metadata, stats, and latest prices from Goldsky-indexed events
  const [metadataRows, statsRows, priceEventRows] = await Promise.all([
    sql`SELECT * FROM market_metadata WHERE market_id = ANY(${marketIds})`,
    sql`SELECT * FROM market_stats WHERE market_id = ANY(${marketIds})`,
    sql`
      SELECT * FROM indexer.callback_receiver_events
      WHERE event_signature LIKE '%PricesUpdated%'
      ORDER BY block_timestamp DESC
    `.catch(() => []),  // table may not exist yet before Goldsky indexes
  ]);

  const metaMap = new Map(metadataRows.map((r) => [r.market_id, r]));
  const statsMap = new Map(statsRows.map((r) => [r.market_id, r]));

  // Build price map from indexed PricesUpdated events (latest per market)
  const priceMap = new Map<string, { yes_price: number; no_price: number }>();
  for (const row of priceEventRows as unknown as IndexerEvent[]) {
    const parsed = parsePricesUpdated(row);
    if (parsed && !priceMap.has(parsed.marketId)) {
      priceMap.set(parsed.marketId, { yes_price: parsed.yesPrice, no_price: parsed.noPrice });
    }
  }

  let markets: MarketWithMeta[] = created.map((c) => {
    const m = c!;
    const res = resolvedMap.get(m.marketId);
    const meta = metaMap.get(m.marketId);
    const stats = statsMap.get(m.marketId);
    const price = priceMap.get(m.marketId);

    return {
      marketId: m.marketId,
      question: m.question,
      outcomes: m.outcomes,
      resolutionTime: new Date(Number(m.resolutionTime) * 1000).toISOString(),
      winningOutcome: res?.winningOutcome ?? 0,
      resolved: !!res,
      creator: m.creator,
      transactionHash: m.transactionHash,
      imageUrl: meta?.image_url ?? null,
      description: meta?.description ?? null,
      category: meta?.category ?? null,
      featured: meta?.featured ?? false,
      orderCount: stats?.order_count ?? 0,
      totalVolume: stats?.total_volume ?? "0",
      uniqueTraders: stats?.unique_traders ?? 0,
      lastOrderAt: stats?.last_order_at ?? null,
      yesPrice: price?.yes_price ?? 5000,
      noPrice: price?.no_price ?? 5000,
    };
  });

  // Apply filters
  if (filters?.category) {
    markets = markets.filter((m) => m.category === filters.category);
  }
  if (filters?.featured !== undefined) {
    markets = markets.filter((m) => m.featured === filters.featured);
  }
  if (filters?.status) {
    const now = Date.now();
    markets = markets.filter((m) => {
      if (filters.status === "resolved") return m.resolved;
      if (filters.status === "expired")
        return !m.resolved && new Date(m.resolutionTime).getTime() < now;
      // open
      return !m.resolved && new Date(m.resolutionTime).getTime() >= now;
    });
  }

  return markets;
}

export async function getMarket(marketId: string): Promise<MarketWithMeta | null> {
  const markets = await getMarkets();
  return markets.find((m) => m.marketId === marketId) ?? null;
}

export async function upsertMarketMetadata(
  marketId: string,
  data: {
    imageUrl?: string | null;
    description?: string | null;
    category?: string | null;
    featured?: boolean;
  }
) {
  const sql = getDb();
  await sql`
    INSERT INTO market_metadata (market_id, image_url, description, category, featured, updated_at)
    VALUES (${marketId}, ${data.imageUrl ?? null}, ${data.description ?? null}, ${data.category ?? null}, ${data.featured ?? false}, now())
    ON CONFLICT (market_id) DO UPDATE SET
      image_url = COALESCE(${data.imageUrl ?? null}, market_metadata.image_url),
      description = COALESCE(${data.description ?? null}, market_metadata.description),
      category = COALESCE(${data.category ?? null}, market_metadata.category),
      featured = COALESCE(${data.featured ?? null}, market_metadata.featured),
      updated_at = now()
  `;
}
