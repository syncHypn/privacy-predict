"use client";

import { use } from "react";
import { useMarket } from "@/lib/hooks/useMarkets";
import { TradingPanel } from "@/components/trading/TradingPanel";
import { PriceChart } from "@/components/markets/PriceChart";
import { PriceBar } from "@/components/markets/PriceBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { shortenAddress, timeUntil } from "@/lib/utils";
import { ADDRESSES } from "@/lib/contracts/addresses";

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = id as `0x${string}`;
  const { market, isLoading, error } = useMarket(marketId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-3/4" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-lg text-muted-foreground">Market not found</p>
      </div>
    );
  }

  const isExpired =
    BigInt(Math.floor(Date.now() / 1000)) >= market.resolutionTime;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
            {market.question}
          </h1>
          <Badge
            variant={
              market.resolved
                ? "default"
                : isExpired
                ? "destructive"
                : "secondary"
            }
            className="shrink-0 mt-1"
          >
            {market.resolved
              ? "Resolved"
              : isExpired
              ? "Expired"
              : timeUntil(market.resolutionTime)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — Market Info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Price Chart */}
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <PriceChart marketId={marketId} />
            </CardContent>
          </Card>

          {/* Outcome Prices */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="py-4 text-center">
                <p className="text-3xl font-bold text-[var(--color-yes)]">50%</p>
                <p className="text-sm text-muted-foreground">{market.outcomes[0] || "Yes"}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-4 text-center">
                <p className="text-3xl font-bold text-[var(--color-no)]">50%</p>
                <p className="text-sm text-muted-foreground">{market.outcomes[1] || "No"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Market Details */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow
                label="Market ID"
                value={`${marketId.slice(0, 18)}...`}
                mono
                href={`https://sepolia.arbiscan.io/address/${ADDRESSES.MarketFactory}`}
              />
              <Separator className="bg-border" />
              <DetailRow
                label="Creator"
                value={shortenAddress(market.creator)}
                mono
                href={`https://sepolia.arbiscan.io/address/${market.creator}`}
              />
              <Separator className="bg-border" />
              <DetailRow
                label="Resolution"
                value={new Date(
                  Number(market.resolutionTime) * 1000
                ).toLocaleString()}
              />
              <Separator className="bg-border" />
              <DetailRow
                label="Outcomes"
                value={market.outcomes.join(", ")}
              />
              <Separator className="bg-border" />
              <DetailRow
                label="Status"
                value={
                  market.resolved
                    ? `Resolved — Winner: ${market.outcomes[market.winningOutcome]}`
                    : "Open"
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* Right — Trading Panel */}
        <div>
          <TradingPanel marketId={marketId} question={market.question} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const valueClass = `${mono ? "font-mono text-xs" : ""}`;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${valueClass} inline-flex items-center gap-1 text-primary hover:underline`}
        >
          {value}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      ) : (
        <span className={`text-foreground ${valueClass}`}>{value}</span>
      )}
    </div>
  );
}
