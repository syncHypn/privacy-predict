"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { EnrichedMarket } from "@/types/market";

export function useMarkets(filters?: {
  category?: string;
  featured?: boolean;
  status?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["markets", filters],
    queryFn: () => api.getMarkets(filters),
  });

  return {
    markets: (data ?? []) as EnrichedMarket[],
    isLoading,
  };
}

export function useMarket(marketId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["market", marketId],
    queryFn: () => api.getMarket(marketId),
    enabled: !!marketId,
  });

  return {
    market: data as EnrichedMarket | undefined,
    isLoading,
    error,
  };
}
