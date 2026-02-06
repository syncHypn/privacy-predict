import { getDb } from "../db";
import {
  parseOrderSubmitted,
  parseOrderCancelled,
  type IndexerEvent,
  type OrderSubmittedEvent,
} from "./indexer-parser";

export interface OrderWithStatus extends OrderSubmittedEvent {
  cancelled: boolean;
}

export async function getOrders(filters?: {
  user?: string;
  market?: string;
  page?: number;
  limit?: number;
}): Promise<{ orders: OrderWithStatus[]; total: number }> {
  const sql = getDb();
  const page = filters?.page ?? 1;
  const limit = Math.min(filters?.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  let submittedRows: IndexerEvent[];

  if (filters?.user && filters?.market) {
    submittedRows = (await sql`
      SELECT * FROM indexer.order_queue_events
      WHERE event_signature LIKE '%OrderSubmitted%'
        AND event_params[3] = ${filters.user.toLowerCase()}
        AND event_params[2] = ${filters.market.toLowerCase()}
      ORDER BY block_number DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as IndexerEvent[];
  } else if (filters?.user) {
    submittedRows = (await sql`
      SELECT * FROM indexer.order_queue_events
      WHERE event_signature LIKE '%OrderSubmitted%'
        AND event_params[3] = ${filters.user.toLowerCase()}
      ORDER BY block_number DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as IndexerEvent[];
  } else if (filters?.market) {
    submittedRows = (await sql`
      SELECT * FROM indexer.order_queue_events
      WHERE event_signature LIKE '%OrderSubmitted%'
        AND event_params[2] = ${filters.market.toLowerCase()}
      ORDER BY block_number DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as IndexerEvent[];
  } else {
    submittedRows = (await sql`
      SELECT * FROM indexer.order_queue_events
      WHERE event_signature LIKE '%OrderSubmitted%'
      ORDER BY block_number DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as IndexerEvent[];
  }

  // Get all cancellations to check status
  const cancelledRows = (await sql`
    SELECT * FROM indexer.order_queue_events
    WHERE event_signature LIKE '%OrderCancelled%'
  `) as unknown as IndexerEvent[];

  const cancelledSet = new Set(
    cancelledRows
      .map(parseOrderCancelled)
      .filter(Boolean)
      .map((c) => c!.orderId)
  );

  const orders: OrderWithStatus[] = submittedRows
    .map(parseOrderSubmitted)
    .filter(Boolean)
    .map((o) => ({
      ...o!,
      cancelled: cancelledSet.has(o!.orderId),
    }));

  // Get total count
  const countResult = await sql`
    SELECT COUNT(*) as count FROM indexer.order_queue_events
    WHERE event_signature LIKE '%OrderSubmitted%'
  `;
  const total = Number(countResult[0]?.count ?? 0);

  return { orders, total };
}
