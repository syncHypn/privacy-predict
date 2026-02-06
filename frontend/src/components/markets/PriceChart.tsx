"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  LineStyle,
  AreaSeries,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

interface PricePoint {
  time: number;
  value: number;
}

interface PriceChartProps {
  marketId: string;
}

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
      span = 7776000;
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

  // Fetch prices from API
  const { data: priceData } = useQuery({
    queryKey: ["prices", marketId, range],
    queryFn: () => api.getPrices(marketId, range),
  });

  const hasRealData = (priceData?.length ?? 0) > 0;

  // Convert API data to chart points
  const chartData = useMemo(() => {
    if (!priceData || priceData.length === 0) return buildFlatLine(range);

    const points: PricePoint[] = priceData.map((p) => ({
      time: Math.floor(new Date(p.timestamp).getTime() / 1000),
      value: p.yesPrice / 100, // 0-10000 → 0-100%
    }));

    // Deduplicate by timestamp
    const seen = new Set<number>();
    const unique = points.filter((p) => {
      if (seen.has(p.time)) return false;
      seen.add(p.time);
      return true;
    });

    return unique.length > 0 ? unique : buildFlatLine(range);
  }, [priceData, range]);

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
