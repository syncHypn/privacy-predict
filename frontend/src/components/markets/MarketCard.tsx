"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { shortenAddress } from "@/lib/utils";
import type { EnrichedMarket } from "@/types/market";

interface MarketCardProps {
  market: EnrichedMarket;
}

function timeUntilISO(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const CATEGORY_ICONS: Record<string, string> = {
  crypto: "₿",
  sports: "⚽",
  politics: "🏛",
  tech: "💻",
  entertainment: "🎬",
  other: "•",
};

export function MarketCard({ market }: MarketCardProps) {
  const isExpired = new Date(market.resolutionTime).getTime() < Date.now();

  const yesPct = Math.round(market.yesPrice / 100);
  const noPct = Math.round(market.noPrice / 100);

  const outcomeCount = market.outcomes.length;
  const maxVisible = 3;
  const visibleOutcomes = market.outcomes.slice(0, maxVisible);
  const hiddenCount = outcomeCount - maxVisible;

  const outcomePrices = visibleOutcomes.map((_, i) => {
    if (outcomeCount === 2) return i === 0 ? yesPct : noPct;
    return Math.round(10000 / outcomeCount / 100);
  });

  return (
    <Link href={`/markets/${market.marketId}`}>
      <div className="group cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Image banner */}
        <div className="relative h-36 w-full bg-secondary">
          {market.imageUrl ? (
            <Image
              src={market.imageUrl}
              alt=""
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl text-muted-foreground/30">
              {CATEGORY_ICONS[market.category || "other"] || "•"}
            </div>
          )}
          {/* Overlay badges */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            {market.category && (
              <span className="rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-0.5 text-xs font-medium text-white">
                {market.category}
              </span>
            )}
            {market.featured && (
              <span className="rounded-full bg-primary/80 backdrop-blur-sm px-2.5 py-0.5 text-xs font-medium text-white">
                Featured
              </span>
            )}
          </div>
          <div className="absolute top-3 right-3">
            <Badge
              variant={
                market.resolved
                  ? "default"
                  : isExpired
                    ? "destructive"
                    : "secondary"
              }
              className="text-xs backdrop-blur-sm"
            >
              {market.resolved
                ? "Resolved"
                : isExpired
                  ? "Expired"
                  : timeUntilISO(market.resolutionTime)}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="text-base font-semibold leading-tight text-card-foreground group-hover:text-primary transition-colors line-clamp-2 mb-3">
            {market.question}
          </h3>

          {/* Outcome rows */}
          <div className="space-y-0 divide-y divide-border/50">
            {visibleOutcomes.map((outcome, i) => {
              const pct = outcomePrices[i];
              const multiplier = pct > 0 ? (100 / pct).toFixed(2) : "-.--";

              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 first:pt-0"
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
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>{outcomeCount} outcomes</span>
              {market.orderCount > 0 && (
                <span>{market.orderCount} orders</span>
              )}
            </div>
            <span>by {shortenAddress(market.creator)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
