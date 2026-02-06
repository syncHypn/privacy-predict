"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { MarketWithMeta } from "@/lib/services/market.service";

const EXPLORER_URL = "https://sepolia.arbiscan.io";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(hex: string, chars = 6): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

export default function ActivityPage() {
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["activity-orders"],
    queryFn: () => api.getOrders({ limit: 100 }),
    refetchInterval: 10_000,
  });

  const { data: markets } = useQuery({
    queryKey: ["activity-markets"],
    queryFn: () => api.getMarkets(),
    refetchInterval: 30_000,
  });

  const marketMap = new Map<string, MarketWithMeta>();
  markets?.forEach((m) => marketMap.set(m.marketId.toLowerCase(), m));

  const orders = ordersData?.orders ?? [];
  const totalOrders = ordersData?.total ?? 0;
  const activeMarkets = new Set(orders.map((o) => o.marketId.toLowerCase())).size;
  const pendingCount = orders.filter((o) => !o.cancelled).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Live Activity</h1>
        <p className="text-muted-foreground">
          Confidential order flow — orders are visible on-chain but their contents are encrypted
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Total Orders</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Encrypted (Pending)</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{activeMarkets}</div>
            <p className="text-xs text-muted-foreground">Markets with Activity</p>
          </CardContent>
        </Card>
      </div>

      {/* Order Feed */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Order Feed</CardTitle>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Auto-refreshing
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No orders yet. Submit an order on any market to see it here.
            </p>
          ) : (
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_2fr_1fr_2fr_0.8fr_0.8fr] gap-4 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
                <span>Order ID</span>
                <span>Market</span>
                <span>Trader</span>
                <span>Encrypted Payload</span>
                <span>Time</span>
                <span>Status</span>
              </div>

              {/* Order rows */}
              {orders.map((order) => {
                const market = marketMap.get(order.marketId.toLowerCase());
                const row = (
                  <div
                    key={order.orderId}
                    className="grid grid-cols-[1fr_2fr_1fr_2fr_0.8fr_0.8fr] gap-4 rounded-md px-2 -mx-2 py-3 text-sm transition-colors hover:bg-secondary/50 cursor-pointer items-center"
                  >
                    {/* Order ID */}
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.orderId.slice(0, 10)}...
                    </span>

                    {/* Market question */}
                    <span className="truncate text-foreground text-xs">
                      {market?.question ?? truncate(order.marketId, 8)}
                    </span>

                    {/* Trader address */}
                    <span className="font-mono text-xs text-muted-foreground">
                      {truncate(order.user, 4)}
                    </span>

                    {/* Encrypted payload */}
                    <span className="font-mono text-[10px] truncate rounded bg-secondary/80 px-2 py-1 text-muted-foreground">
                      {order.encryptedPayload.slice(0, 42)}...
                    </span>

                    {/* Time */}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(order.blockTimestamp)}
                    </span>

                    {/* Status */}
                    {order.cancelled ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                      >
                        Cancelled
                      </Badge>
                    ) : (
                      <Badge
                        className="bg-primary/20 text-primary border-primary/30 text-[10px]"
                      >
                        Encrypted
                      </Badge>
                    )}
                  </div>
                );

                return (
                  <a
                    key={order.orderId}
                    href={`${EXPLORER_URL}/tx/${order.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row}
                  </a>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
