"use client";

import { useMarkets } from "@/lib/hooks/useMarkets";
import { useAppStore } from "@/store/useAppStore";

const CATEGORY_ICONS: Record<string, string> = {
  crypto: "₿",
  sports: "⚽",
  politics: "🏛",
  tech: "💻",
  entertainment: "🎬",
  other: "•",
};

export function CategoryBanner() {
  const { markets } = useMarkets();
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);

  // Collect unique categories with market counts
  const categoryCounts = new Map<string, number>();
  for (const m of markets) {
    const cat = m.category || "other";
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  const categories = Array.from(categoryCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  if (categories.length === 0) return null;

  return (
    <div className="border-b border-border bg-card/30">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedCategory === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All
          <span className="ml-1 opacity-60">{markets.length}</span>
        </button>
        {categories.map(([cat, count]) => (
          <button
            key={cat}
            onClick={() =>
              setSelectedCategory(selectedCategory === cat ? null : cat)
            }
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="mr-1">{CATEGORY_ICONS[cat] || "•"}</span>
            {cat}
            <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
