import type { MarketWithMeta } from "./services/market.service";
import type { OrderWithStatus } from "./services/order.service";
import type { PricePoint } from "./services/price.service";
import type { OverviewStats } from "./services/stats.service";
import type { UserTransfers } from "./services/deposit.service";

const BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getMarkets(params?: {
    category?: string;
    featured?: boolean;
    status?: string;
  }): Promise<MarketWithMeta[]> {
    const sp = new URLSearchParams();
    if (params?.category) sp.set("category", params.category);
    if (params?.featured !== undefined)
      sp.set("featured", String(params.featured));
    if (params?.status) sp.set("status", params.status);
    const qs = sp.toString();
    return fetchJSON(`${BASE}/markets${qs ? `?${qs}` : ""}`);
  },

  getMarket(marketId: string): Promise<MarketWithMeta> {
    return fetchJSON(`${BASE}/markets/${marketId}`);
  },

  getPrices(
    marketId: string,
    range?: string
  ): Promise<PricePoint[]> {
    const qs = range ? `?range=${range}` : "";
    return fetchJSON(`${BASE}/markets/${marketId}/prices${qs}`);
  },

  getOrders(params?: {
    user?: string;
    market?: string;
    page?: number;
    limit?: number;
  }): Promise<{ orders: OrderWithStatus[]; total: number }> {
    const sp = new URLSearchParams();
    if (params?.user) sp.set("user", params.user);
    if (params?.market) sp.set("market", params.market);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return fetchJSON(`${BASE}/orders${qs ? `?${qs}` : ""}`);
  },

  getDeposits(user: string): Promise<UserTransfers> {
    return fetchJSON(`${BASE}/deposits?user=${encodeURIComponent(user)}`);
  },

  getStats(): Promise<OverviewStats> {
    return fetchJSON(`${BASE}/stats/overview`);
  },

  async updateMetadata(
    marketId: string,
    data: {
      imageUrl?: string | null;
      description?: string | null;
      category?: string | null;
      featured?: boolean;
    },
    apiKey: string
  ): Promise<void> {
    const res = await fetch(`${BASE}/markets/${marketId}/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
  },
};
