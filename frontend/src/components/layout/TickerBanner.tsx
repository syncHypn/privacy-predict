'use client';

import { useEffect, useState } from 'react';

// ─── Types ───────────────────────────────────────────────
interface CryptoItem {
  symbol: string;
  price: number;
  change24h: number;
}

interface StockItem {
  symbol: string;
  price: number;
  change: number;
  percentChange: number;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
}

// ─── Data fetching ───────────────────────────────────────
const CRYPTO_IDS =
  'bitcoin,ethereum,xrp,solana,arbitrum,zcash,dogecoin,iexec-rlc,chainlink';
const CRYPTO_SYMBOLS: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  xrp: 'XRP',
  solana: 'SOL',
  dogecoin: 'DOGE',
  zcash: 'ZEC',
  arbitrum: 'ARB',
  chainlink: 'LINK',
  'iexec-rlc': 'RLC',
};

const STOCK_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'MSFT', 'MSTR'];

async function fetchCrypto(): Promise<CryptoItem[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${CRYPTO_IDS}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Object.entries(data).map(([id, val]: [string, any]) => ({
      symbol: CRYPTO_SYMBOLS[id] || id.toUpperCase(),
      price: val.usd,
      change24h: val.usd_24h_change ?? 0,
    }));
  } catch {
    return [];
  }
}

async function fetchStocks(): Promise<StockItem[]> {
  const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const results = await Promise.all(
      STOCK_SYMBOLS.map(async (symbol) => {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`
        );
        if (!res.ok) return null;
        const d = await res.json();
        if (!d.c) return null;
        return {
          symbol,
          price: d.c,
          change: d.d ?? 0,
          percentChange: d.dp ?? 0,
        } as StockItem;
      })
    );
    return results.filter((s): s is StockItem => s !== null);
  } catch {
    return [];
  }
}

async function fetchNews(): Promise<NewsItem[]> {
  const key = process.env.NEXT_PUBLIC_NEWS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=10&apiKey=${key}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles ?? [])
      .filter((a: any) => a.title && a.title !== '[Removed]')
      .map((a: any) => ({
        title: a.title,
        source: a.source?.name ?? '',
        url: a.url ?? '',
      }));
  } catch {
    return [];
  }
}

// ─── Marquee component ──────────────────────────────────
function Marquee({
  children,
  speed = 40,
}: {
  children: React.ReactNode;
  speed?: number;
}) {
  return (
    <div className='relative overflow-hidden whitespace-nowrap'>
      <div
        className='inline-flex animate-marquee'
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}

// ─── Change indicator ────────────────────────────────────
function Change({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`text-xs font-medium ${
        positive ? 'text-[var(--color-yes)]' : 'text-[var(--color-no)]'
      }`}
    >
      {positive ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

// ─── Main component ─────────────────────────────────────
export function TickerBanner() {
  const [crypto, setCrypto] = useState<CryptoItem[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    fetchCrypto().then(setCrypto);
    fetchStocks().then(setStocks);
    fetchNews().then(setNews);

    const interval = setInterval(() => {
      fetchCrypto().then(setCrypto);
      fetchStocks().then(setStocks);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const hasCrypto = crypto.length > 0;
  const hasStocks = stocks.length > 0;
  const hasNews = news.length > 0;

  if (!hasCrypto && !hasStocks && !hasNews) return null;

  return (
    <div className='border-b border-border bg-card/50 text-xs'>
      {/* Crypto */}
      {hasCrypto && (
        <div className='border-b border-border/50 py-1.5'>
          <Marquee speed={30}>
            <div className='flex items-center gap-6 px-4'>
              {crypto.map((c) => (
                <span key={c.symbol} className='flex items-center gap-1.5'>
                  <span className='font-medium text-foreground'>
                    {c.symbol}
                  </span>
                  <span className='text-muted-foreground'>
                    $
                    {c.price.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <Change value={c.change24h} />
                </span>
              ))}
            </div>
          </Marquee>
        </div>
      )}

      {/* Stocks */}
      {hasStocks && (
        <div className='border-b border-border/50 py-1.5'>
          <Marquee speed={35}>
            <div className='flex items-center gap-6 px-4'>
              {stocks.map((s) => (
                <span key={s.symbol} className='flex items-center gap-1.5'>
                  <span className='font-medium text-foreground'>
                    {s.symbol}
                  </span>
                  <span className='text-muted-foreground'>
                    $
                    {s.price.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <Change value={s.percentChange} />
                </span>
              ))}
            </div>
          </Marquee>
        </div>
      )}

      {/* News */}
      {hasNews && (
        <div className='py-1.5'>
          <Marquee speed={80}>
            <div className='flex items-center gap-8 px-4'>
              {news.map((n, i) => (
                <a
                  key={i}
                  href={n.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center gap-1.5 hover:text-primary transition-colors'
                >
                  <span className='text-muted-foreground'>{n.source}</span>
                  <span className='text-foreground'>{n.title}</span>
                </a>
              ))}
            </div>
          </Marquee>
        </div>
      )}
    </div>
  );
}
