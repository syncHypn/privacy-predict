"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { OrderQueueABI } from "../contracts/abis/OrderQueue";
import type { EncryptedOrder } from "@/types/market";

const orderQueueConfig = {
  address: ADDRESSES.OrderQueue as `0x${string}`,
  abi: OrderQueueABI,
} as const;

export function useUserOrders(address: `0x${string}` | undefined) {
  const {
    data: orderIds,
    isLoading: idsLoading,
  } = useReadContract({
    ...orderQueueConfig,
    functionName: "getUserOrders",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const ids = (orderIds as `0x${string}`[] | undefined) ?? [];

  const orderContracts = ids.map((id) => ({
    ...orderQueueConfig,
    functionName: "getOrder" as const,
    args: [id] as const,
  }));

  const {
    data: ordersResult,
    isLoading: ordersLoading,
  } = useReadContracts({
    contracts: orderContracts,
    query: { enabled: ids.length > 0 },
  });

  const orders: EncryptedOrder[] =
    ordersResult
      ?.map((r) => r.result as EncryptedOrder | undefined)
      .filter((o): o is EncryptedOrder => !!o) ?? [];

  return {
    orders,
    orderIds: ids,
    isLoading: idsLoading || ordersLoading,
  };
}
