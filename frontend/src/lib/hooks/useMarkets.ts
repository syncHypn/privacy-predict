"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { MarketFactoryABI } from "../contracts/abis/MarketFactory";
import type { Market } from "@/types/market";

const marketFactoryConfig = {
  address: ADDRESSES.MarketFactory as `0x${string}`,
  abi: MarketFactoryABI,
} as const;

export function useMarketCount() {
  return useReadContract({
    ...marketFactoryConfig,
    functionName: "getMarketCount",
  });
}

export function useMarkets() {
  const { data: count, isLoading: countLoading } = useMarketCount();

  const marketCount = count ? Number(count) : 0;

  // Fetch all market IDs
  const idContracts = Array.from({ length: marketCount }, (_, i) => ({
    ...marketFactoryConfig,
    functionName: "getMarketIdAt" as const,
    args: [BigInt(i)] as const,
  }));

  const {
    data: idsResult,
    isLoading: idsLoading,
  } = useReadContracts({
    contracts: idContracts,
    query: { enabled: marketCount > 0 },
  });

  const marketIds = idsResult
    ?.map((r) => r.result as `0x${string}` | undefined)
    .filter((id): id is `0x${string}` => !!id) ?? [];

  // Fetch all market details
  const marketContracts = marketIds.map((id) => ({
    ...marketFactoryConfig,
    functionName: "getMarket" as const,
    args: [id] as const,
  }));

  const {
    data: marketsResult,
    isLoading: marketsLoading,
  } = useReadContracts({
    contracts: marketContracts,
    query: { enabled: marketIds.length > 0 },
  });

  const markets: Market[] =
    marketsResult
      ?.map((r) => r.result as Market | undefined)
      .filter((m): m is Market => !!m) ?? [];

  return {
    markets,
    isLoading: countLoading || idsLoading || marketsLoading,
  };
}

export function useMarket(marketId: `0x${string}`) {
  const { data, isLoading, error } = useReadContract({
    ...marketFactoryConfig,
    functionName: "getMarket",
    args: [marketId],
    query: { enabled: !!marketId },
  });

  return {
    market: data as Market | undefined,
    isLoading,
    error,
  };
}
