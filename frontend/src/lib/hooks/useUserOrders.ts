"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { EnrichedOrder } from "@/types/market";

export function useUserOrders(address: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ["orders", address],
    queryFn: () => api.getOrders({ user: address }),
    enabled: !!address,
  });

  const orders: EnrichedOrder[] =
    data?.orders?.map((o) => ({
      orderId: o.orderId,
      marketId: o.marketId,
      user: o.user,
      encryptedPayload: o.encryptedPayload,
      timestamp: String(o.timestamp),
      blockTimestamp: o.blockTimestamp,
      transactionHash: o.transactionHash,
      cancelled: o.cancelled,
    })) ?? [];

  return {
    orders,
    total: data?.total ?? 0,
    isLoading,
  };
}
