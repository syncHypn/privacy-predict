"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "../wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { OrderQueueABI } from "../contracts/abis/OrderQueue";
import { parseAbiItem } from "viem";
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

  // Fetch OrderSubmitted event logs to get tx hashes
  const { data: txHashMap } = useQuery({
    queryKey: ["orderTxHashes", address],
    queryFn: async () => {
      if (!address) return {};
      const client = getPublicClient(wagmiConfig);
      if (!client) return {};

      const logs = await client.getLogs({
        address: ADDRESSES.OrderQueue as `0x${string}`,
        event: parseAbiItem(
          "event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp)"
        ),
        args: { user: address },
        fromBlock: BigInt(0),
        toBlock: "latest",
      });

      const map: Record<string, `0x${string}`> = {};
      for (const log of logs) {
        if (log.args.orderId && log.transactionHash) {
          map[log.args.orderId] = log.transactionHash;
        }
      }
      return map;
    },
    enabled: !!address && ids.length > 0,
  });

  const orders: EncryptedOrder[] =
    ordersResult
      ?.map((r) => r.result as EncryptedOrder | undefined)
      .filter((o): o is EncryptedOrder => !!o) ?? [];

  return {
    orders,
    orderIds: ids,
    txHashMap: txHashMap ?? {},
    isLoading: idsLoading || ordersLoading,
  };
}
