"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { timeUntil, shortenAddress } from "@/lib/utils";
import type { Market } from "@/types/market";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const isExpired =
    BigInt(Math.floor(Date.now() / 1000)) >= market.resolutionTime;

  // Default equal prices for each outcome (will be replaced by real prices later)
  const outcomeCount = market.outcomes.length;
  const defaultPrice = 1 / outcomeCount;

  // Show up to 3 outcomes, then a "+N more" row
  const maxVisible = 3;
  const visibleOutcomes = market.outcomes.slice(0, maxVisible);
  const hiddenCount = outcomeCount - maxVisible;

  return (
    <Link href={`/markets/${market.marketId}`}>
      <div className="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold leading-tight text-card-foreground group-hover:text-primary transition-colors line-clamp-2">
            {market.question}
          </h3>
          <Badge
            variant={
              market.resolved
                ? "default"
                : isExpired
                  ? "destructive"
                  : "secondary"
            }
            className="shrink-0 text-xs"
          >
            {market.resolved
              ? "Resolved"
              : isExpired
                ? "Expired"
                : timeUntil(market.resolutionTime)}
          </Badge>
        </div>

        {/* Outcome rows */}
        <div className="space-y-0 divide-y divide-border/50">
          {visibleOutcomes.map((outcome, i) => {
            const price = defaultPrice;
            const pct = Math.round(price * 100);
            const multiplier = (1 / price).toFixed(2);

            return (
              <div
                key={i}
                className="flex items-center justify-between py-3 first:pt-0"
              >
                <span className="text-sm font-medium text-card-foreground truncate mr-3">
                  {outcome}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-muted-foreground">
                    {multiplier}x
                  </span>
                  <span className="inline-flex items-center justify-center min-w-[52px] rounded-full border border-primary/50 px-3 py-1 text-sm font-medium text-primary">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {hiddenCount > 0 && (
          <div className="pt-2 text-xs text-muted-foreground">
            +{hiddenCount} more outcome{hiddenCount > 1 ? "s" : ""}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-1 border-t border-border/50 text-xs text-muted-foreground">
          <span>{outcomeCount} outcomes</span>
          <span>by {shortenAddress(market.creator)}</span>
        </div>
      </div>
    </Link>
  );
}
