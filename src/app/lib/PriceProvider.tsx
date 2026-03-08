"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

/* ─────────────────────────────────────────
   PriceProvider — fetches /api/prices once
   per 60s, shares via context.
   ───────────────────────────────────────── */

type PriceMap = Record<string, number>; // symbol → USD price

type PriceCtx = {
  prices: PriceMap;
  loading: boolean;
  /** Convert amount of tokenA to equivalent amount of tokenB */
  convert: (amount: number, from: string, to: string) => number | null;
  /** Get USD price for a symbol */
  usd: (symbol: string) => number | null;
  /** Format as USD string */
  fmtUsd: (amount: number) => string;
};

const PriceContext = createContext<PriceCtx>({
  prices: {},
  loading: true,
  convert: () => null,
  usd: () => null,
  fmtUsd: () => "—",
});

export const usePrices = () => useContext(PriceContext);

const REFRESH_INTERVAL = 60_000; // 60s — matches server cache TTL

export function PriceProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices");
      const data = await res.json();
      if (data.success && data.prices) {
        setPrices(data.prices);
      }
    } catch {
      // silent — keep stale prices
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchPrices]);

  const usd = useCallback(
    (symbol: string): number | null => {
      return prices[symbol] ?? null;
    },
    [prices],
  );

  const convert = useCallback(
    (amount: number, from: string, to: string): number | null => {
      const fromPrice = prices[from];
      const toPrice = prices[to];
      if (!fromPrice || !toPrice || toPrice === 0) return null;
      return (amount * fromPrice) / toPrice;
    },
    [prices],
  );

  const fmtUsd = useCallback((amount: number): string => {
    if (amount < 0.01) return "<$0.01";
    return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  return (
    <PriceContext.Provider value={{ prices, loading, convert, usd, fmtUsd }}>
      {children}
    </PriceContext.Provider>
  );
}
