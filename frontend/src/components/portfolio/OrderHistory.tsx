"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserOrders } from "@/lib/hooks/useUserOrders";
import type { EnrichedOrder } from "@/types/market";

const EXPLORER_URL = "https://sepolia.arbiscan.io";

interface OrderHistoryProps {
  address: `0x${string}` | undefined;
}

export function OrderHistory({ address }: OrderHistoryProps) {
  const { orders, isLoading } = useUserOrders(address);

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg">Order History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No orders yet. Start trading to see your order history.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-4 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
              <span>Order ID</span>
              <span>Market</span>
              <span>Time</span>
              <span>Status</span>
            </div>
            {orders.map((order) => (
              <OrderRow key={order.orderId} order={order} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrderRow({ order }: { order: EnrichedOrder }) {
  const timestamp = new Date(order.blockTimestamp);

  const row = (
    <div
      className={`grid grid-cols-4 gap-4 py-2 text-sm rounded-md px-2 -mx-2 ${
        order.transactionHash
          ? "cursor-pointer transition-colors hover:bg-secondary/50"
          : ""
      }`}
    >
      <span className="font-mono text-xs text-muted-foreground">
        {order.orderId.slice(0, 10)}...
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {order.marketId.slice(0, 10)}...
      </span>
      <span className="text-muted-foreground">
        {timestamp.toLocaleDateString()}
      </span>
      <span className={`flex items-center gap-1 ${order.cancelled ? "text-[var(--color-no)]" : "text-primary"}`}>
        {order.cancelled ? "Cancelled" : "Encrypted"}
        {order.transactionHash && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            className="text-muted-foreground"
          >
            <path
              d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </div>
  );

  if (order.transactionHash) {
    return (
      <a
        href={`${EXPLORER_URL}/tx/${order.transactionHash}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {row}
      </a>
    );
  }

  return row;
}
