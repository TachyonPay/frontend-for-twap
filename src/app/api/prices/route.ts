import { NextResponse } from "next/server";

/* ─────────────────────────────────────────
   /api/prices — proxy to Yahoo Finance
   Server-side cache: 60s. Fetches all symbols in one call.
   ───────────────────────────────────────── */

const SYMBOLS = ["TSLA", "AMZN", "ETH-USD", "ZEN-USD"];
const CACHE_TTL = 60_000; // 60 seconds

let cache: { data: Record<string, number>; ts: number } | null = null;

async function fetchPrices(): Promise<Record<string, number>> {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  const symbols = SYMBOLS.join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    // If Yahoo v7 fails, try v6 spark endpoint as fallback
    return fetchPricesFallback();
  }

  const json = await res.json();
  const quotes = json?.quoteResponse?.result ?? [];
  const prices: Record<string, number> = { USDC: 1 };

  for (const q of quotes) {
    const sym = (q.symbol as string).replace("-USD", "");
    const price = q.regularMarketPrice as number;
    if (sym && price) {
      prices[sym] = price;
    }
  }

  cache = { data: prices, ts: Date.now() };
  return prices;
}

async function fetchPricesFallback(): Promise<Record<string, number>> {
  // Fallback: fetch each symbol individually via chart endpoint
  const prices: Record<string, number> = { USDC: 1 };

  await Promise.all(
    SYMBOLS.map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) return;
        const json = await res.json();
        const price =
          json?.chart?.result?.[0]?.meta?.regularMarketPrice as number;
        if (price) {
          const key = sym.replace("-USD", "");
          prices[key] = price;
        }
      } catch {
        // Skip failed symbols
      }
    }),
  );

  cache = { data: prices, ts: Date.now() };
  return prices;
}

export async function GET() {
  try {
    const prices = await fetchPrices();
    return NextResponse.json({ success: true, prices, ts: Date.now() });
  } catch {
    // Return stale cache if available
    if (cache) {
      return NextResponse.json({
        success: true,
        prices: cache.data,
        ts: cache.ts,
        stale: true,
      });
    }
    return NextResponse.json(
      { success: false, error: "Failed to fetch prices" },
      { status: 500 },
    );
  }
}
