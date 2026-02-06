"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType, LineStyle, AreaSeries } from "lightweight-charts";

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

interface PriceChartProps {
  marketId: string;
}

// Mock data generator — replace with real PriceUpdated event logs
function generateMockData(range: TimeRange) {
  const now = Math.floor(Date.now() / 1000);
  let points: number;
  let interval: number;

  switch (range) {
    case "1H":
      points = 60;
      interval = 60;
      break;
    case "6H":
      points = 72;
      interval = 300;
      break;
    case "1D":
      points = 96;
      interval = 900;
      break;
    case "1W":
      points = 168;
      interval = 3600;
      break;
    case "1M":
      points = 120;
      interval = 21600;
      break;
    case "ALL":
      points = 180;
      interval = 43200;
      break;
  }

  let price = 50;
  const data: { time: number; value: number }[] = [];

  for (let i = points; i >= 0; i--) {
    price += (Math.random() - 0.48) * 3;
    price = Math.max(5, Math.min(95, price));
    data.push({
      time: now - i * interval,
      value: Math.round(price * 100) / 100,
    });
  }

  return data;
}

export function PriceChart({ marketId }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  const [range, setRange] = useState<TimeRange>("1D");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#A3A3A3",
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)", style: LineStyle.Dotted },
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
        vertLine: { color: "rgba(91,140,90,0.3)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(91,140,90,0.3)", width: 1, style: LineStyle.Dashed },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#5B8C5A",
      lineWidth: 2,
      topColor: "rgba(91,140,90,0.25)",
      bottomColor: "rgba(91,140,90,0.0)",
      priceFormat: { type: "custom", formatter: (p: number) => `${p.toFixed(0)}%` },
      crosshairMarkerBackgroundColor: "#5B8C5A",
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: "#0A0A0A",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const data = generateMockData(range);
    series.setData(data as any);
    chart.timeScale().fitContent();

    if (data.length > 0) {
      setCurrentPrice(data[data.length - 1].value);
    }

    // Crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.seriesData.size > 0) {
        const val = param.seriesData.get(series);
        if (val && "value" in val) {
          setCurrentPrice(val.value as number);
        }
      } else if (data.length > 0) {
        setCurrentPrice(data[data.length - 1].value);
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
  }, [range, marketId]);

  const ranges: TimeRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-end justify-between">
        <div>
          {currentPrice !== null && (
            <p className="text-2xl font-bold text-primary">
              {currentPrice.toFixed(0)}%{" "}
              <span className="text-sm font-normal text-muted-foreground">chance</span>
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
