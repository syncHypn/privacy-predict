"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriceBar } from "./PriceBar";
import { timeUntil, shortenAddress } from "@/lib/utils";
import type { Market } from "@/types/market";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const isExpired = BigInt(Math.floor(Date.now() / 1000)) >= market.resolutionTime;

  return (
    <Link href={`/markets/${market.marketId}`}>
      <Card className="group cursor-pointer border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-card-foreground group-hover:text-primary transition-colors">
              {market.question}
            </h3>
            <Badge
              variant={market.resolved ? "default" : isExpired ? "destructive" : "secondary"}
              className="shrink-0 text-xs"
            >
              {market.resolved ? "Resolved" : isExpired ? "Expired" : timeUntil(market.resolutionTime)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <PriceBar yesPrice={0.5} noPrice={0.5} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{market.outcomes.length} outcomes</span>
            <span>by {shortenAddress(market.creator)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
