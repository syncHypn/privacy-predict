"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  LineStyle,
  AreaSeries,
} from "lightweight-charts";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { ADDRESSES } from "@/lib/contracts/addresses";

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

interface PricePoint {
  time: number;
  value: number;
}

interface PriceChartProps {
  marketId: string;
}

const PRICE_SCALE = 10000; // Contract uses 1e4 for price

/** Build a flat 50% line spanning the selected time range */
function buildFlatLine(range: TimeRange): PricePoint[] {
  const now = Math.floor(Date.now() / 1000);
  let span: number;
  let points: number;

  switch (range) {
    case "1H":
      span = 3600;
      points = 12;
      break;
    case "6H":
      span = 21600;
      points = 12;
      break;
    case "1D":
      span = 86400;
      points = 24;
      break;
    case "1W":
      span = 604800;
      points = 14;
      break;
    case "1M":
      span = 2592000;
      points = 30;
      break;
    case "ALL":
      span = 7776000; // 90 days
      points = 30;
      break;
  }

  const interval = Math.floor(span / points);
  const data: PricePoint[] = [];
  for (let i = points; i >= 0; i--) {
    data.push({ time: now - i * interval, value: 50 });
  }
  return data;
}

export function PriceChart({ marketId }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  const [range, setRange] = useState<TimeRange>("ALL");
  const [currentPrice, setCurrentPrice] = useState<number>(50);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [hasRealData, setHasRealData] = useState(false);

  const publicClient = usePublicClient();
  const predictionMarketAddr = ADDRESSES.PredictionMarket;

  // Fetch PriceUpdated events from PredictionMarket (if deployed)
  useEffect(() => {
    if (!publicClient || !predictionMarketAddr) {
      setHasRealData(false);
      return;
    }

    let cancelled = false;

    async function fetchPriceEvents() {
      try {
        const logs = await publicClient!.getLogs({
          address: predictionMarketAddr as `0x${string}`,
          event: parseAbiItem(
            "event PriceUpdated(bytes32 indexed marketId, uint256 priceYes, uint256 priceNo)"
          ),
          args: { marketId: marketId as `0x${string}` },
          fromBlock: BigInt(0),
          toBlock: "latest",
        });

        if (cancelled) return;

        if (logs.length === 0) {
          setHasRealData(false);
          return;
        }

        // Get block timestamps for each log
        const blocks = await Promise.all(
          logs.map((log) =>
            publicClient!.getBlock({ blockNumber: log.blockNumber })
          )
        );

        if (cancelled) return;

        const points: PricePoint[] = logs.map((log, i) => ({
          time: Number(blocks[i].timestamp),
          value:
            Number((log.args as any).priceYes) / (PRICE_SCALE / 100),
        }));

        // Deduplicate by timestamp
        const seen = new Set<number>();
        const unique = points.filter((p) => {
          if (seen.has(p.time)) return false;
          seen.add(p.time);
          return true;
        });

        setPriceHistory(unique);
        setHasRealData(unique.length > 0);
      } catch {
        setHasRealData(false);
      }
    }

    fetchPriceEvents();
    return () => {
      cancelled = true;
    };
  }, [publicClient, predictionMarketAddr, marketId]);

  // Select data based on range and available history
  const chartData = useMemo(() => {
    if (!hasRealData) return buildFlatLine(range);

    const now = Math.floor(Date.now() / 1000);
    let cutoff: number;
    switch (range) {
      case "1H":
        cutoff = now - 3600;
        break;
      case "6H":
        cutoff = now - 21600;
        break;
      case "1D":
        cutoff = now - 86400;
        break;
      case "1W":
        cutoff = now - 604800;
        break;
      case "1M":
        cutoff = now - 2592000;
        break;
      case "ALL":
        cutoff = 0;
        break;
    }

    const filtered = priceHistory.filter((p) => p.time >= cutoff);
    return filtered.length > 0 ? filtered : buildFlatLine(range);
  }, [hasRealData, priceHistory, range]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#A3A3A3" : "#737373";

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor,
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor, style: LineStyle.Dotted },
      },
      width: container.clientWidth,
      height: 300,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: range === "1H" || range === "6H",
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: "rgba(91,140,90,0.3)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(91,140,90,0.3)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#5B8C5A",
      lineWidth: 2,
      topColor: "rgba(91,140,90,0.25)",
      bottomColor: "rgba(91,140,90,0.0)",
      priceFormat: {
        type: "custom",
        formatter: (p: number) => `${p.toFixed(0)}%`,
      },
      crosshairMarkerBackgroundColor: "#5B8C5A",
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: isDark ? "#111111" : "#FAFAFA",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    series.setData(chartData as any);
    chart.timeScale().fitContent();

    if (chartData.length > 0) {
      setCurrentPrice(chartData[chartData.length - 1].value);
    }

    chart.subscribeCrosshairMove((param) => {
      if (param.seriesData.size > 0) {
        const val = param.seriesData.get(series);
        if (val && "value" in val) {
          setCurrentPrice(val.value as number);
        }
      } else if (chartData.length > 0) {
        setCurrentPrice(chartData[chartData.length - 1].value);
      }
    });

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartData, range]);

  const ranges: TimeRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-primary">
            {currentPrice.toFixed(0)}%{" "}
            <span className="text-sm font-normal text-muted-foreground">
              chance
            </span>
          </p>
          {!hasRealData && (
            <p className="text-xs text-muted-foreground">
              No trading activity yet
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
