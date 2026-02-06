"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserOrders } from "@/lib/hooks/useUserOrders";
import { shortenAddress } from "@/lib/utils";
import type { EncryptedOrder } from "@/types/market";

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

function OrderRow({ order }: { order: EncryptedOrder }) {
  const timestamp = new Date(Number(order.timestamp) * 1000);

  return (
    <div className="grid grid-cols-4 gap-4 py-2 text-sm">
      <span className="font-mono text-xs text-muted-foreground">
        {order.orderId.slice(0, 10)}...
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {order.marketId.slice(0, 10)}...
      </span>
      <span className="text-muted-foreground">
        {timestamp.toLocaleDateString()}
      </span>
      <span className="text-primary">Encrypted</span>
    </div>
  );
}
