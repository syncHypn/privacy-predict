"use client";

import { MarketCard } from "./MarketCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Market } from "@/types/market";

interface MarketGridProps {
  markets: Market[];
  isLoading: boolean;
}

export function MarketGrid({ markets, isLoading }: MarketGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg">No markets found</p>
        <p className="text-sm">Be the first to create a prediction market</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {markets.map((market) => (
        <MarketCard key={market.marketId} market={market} />
      ))}
    </div>
  );
}
