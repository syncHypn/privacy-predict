"use client";

import { useMarkets } from "@/lib/hooks/useMarkets";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/useAppStore";

export default function HomePage() {
  const { markets, isLoading } = useMarkets();
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const filteredMarkets = markets.filter((m) =>
    m.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Prediction Markets
        </h1>
        <p className="text-muted-foreground">
          Trade on outcomes with encrypted orders and private balances
        </p>
      </div>

      <Input
        placeholder="Search markets..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md bg-secondary border-border"
      />

      <MarketGrid markets={filteredMarkets} isLoading={isLoading} />
    </div>
  );
}
