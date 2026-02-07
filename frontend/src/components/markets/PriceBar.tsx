"use client";

interface PriceBarProps {
  yesPrice: number;
  noPrice: number;
}

export function PriceBar({ yesPrice, noPrice }: PriceBarProps) {
  const yesPct = yesPrice * 100;
  const noPct = noPrice * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-[var(--color-yes)]">Yes {yesPct.toFixed(2)}%</span>
        <span className="text-[var(--color-no)]">No {noPct.toFixed(2)}%</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="rounded-l-full bg-[var(--color-yes)] transition-all"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="rounded-r-full bg-[var(--color-no)] transition-all"
          style={{ width: `${noPct}%` }}
        />
      </div>
    </div>
  );
}
