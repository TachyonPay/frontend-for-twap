"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { createPublicClient, formatUnits, parseUnits, http } from "viem";
import { useTwapServer, type TwapOrderListItem } from "../hooks/useTwapServer";
import { useApproveToken } from "../hooks/useApproveToken";
import { useOrderStatus } from "../hooks/useOrderStatus";
import { useSettlementStatus } from "../hooks/useSettlementStatus";
import { SOURCE_TOKENS, DEST_TOKENS, ERC20_ABI, baseSepolia, robinhoodTestnet, type SourceToken, type DestToken } from "../lib/constants";
import { usePrices } from "../lib/PriceProvider";

/* ─── token colors ─── */
const TOKEN_COLORS: Record<string, string> = {
  USDC: "#2775ca",
  ETH: "#627eea",
  ZEN: "#00b4d8",
  TSLA: "#e31937",
  AMZN: "#ff9900",
};

/* ─── icons ─── */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

/* ─── icons that need a dark bg because they have white/light backgrounds ─── */
const NEEDS_DARK_BG = new Set(["TSLA"]);

/* ─── token badge ─── */
function TokenBadge({ symbol, icon, size = 28 }: { symbol: string; icon?: string; size?: number }) {
  if (icon) {
    const needsBg = NEEDS_DARK_BG.has(symbol);
    return (
      <div
        className="rounded-md shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          background: needsBg ? "#ffffff" : "transparent",
        }}
      >
        <Image
          src={icon}
          alt={symbol}
          width={Math.round(size * 0.75)}
          height={Math.round(size * 0.75)}
          className="object-contain"
        />
      </div>
    );
  }
  const color = TOKEN_COLORS[symbol] ?? "#5e6ad2";
  return (
    <div
      className="rounded-md flex items-center justify-center font-display font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: color + "18",
        color,
      }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

/* ─── resolve token info from address ─── */
const ALL_TOKENS = [...SOURCE_TOKENS, ...DEST_TOKENS];
function tokenFromAddress(addr: string) {
  return ALL_TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
}
function fmtAmount(raw: string, decimals: number): string {
  const val = formatUnits(BigInt(raw), decimals);
  const n = Number(val);
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  if (n < 1) return n.toPrecision(4);
  if (n < 1000) return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtOrderAmount(raw: string, assetAddr: string): string {
  const tok = tokenFromAddress(assetAddr);
  if (!tok) return raw;
  return `${fmtAmount(raw, tok.decimals)} ${tok.symbol}`;
}
function fmtBal(val: string): string {
  const n = Number(val);
  if (isNaN(n) || n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  if (n < 1) return n.toPrecision(4);
  if (n < 10_000) return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtInterval(sec: number): string {
  if (sec >= 3600) return `${sec / 3600}h`;
  if (sec >= 60) return `${sec / 60}m`;
  return `${sec}s`;
}

/* ─────────────────────────────────────────
   App Page
   ───────────────────────────────────────── */

export default function AppPage() {
  const { address, isConnected } = useAccount();
  const twap = useTwapServer();
  const approve = useApproveToken();
  const settlement = useSettlementStatus();
  const { convert, usd, fmtUsd, loading: pricesLoading } = usePrices();

  // Hydration-safe: avoid SSR mismatch by deferring connected UI to client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && isConnected;

  // UI state
  const [showModal, setShowModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceToken>(SOURCE_TOKENS[0]);
  const [selectedDest, setSelectedDest] = useState<DestToken>(DEST_TOKENS[0]);

  // Orders
  const [orders, setOrders] = useState<TwapOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [tab, setTab] = useState<"active" | "all">("active");

  // Polling for a selected order
  const [pollOrderId, setPollOrderId] = useState<string | null>(null);
  const polledStatus = useOrderStatus(pollOrderId, 5000);

  // Settlement status per order: tracks each intent's solved status
  const [settlementMap, setSettlementMap] = useState<Record<string, { results: { intentId: string; solved: boolean }[]; checking: boolean }>>({});

  // Server status
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Fetch user orders
  const fetchOrders = useCallback(async () => {
    if (!address) return;
    setOrdersLoading(true);
    try {
      const data = await twap.getUserOrders(address);
      setOrders(data);
    } catch {
      /* silent */
    } finally {
      setOrdersLoading(false);
    }
  }, [address, twap]);

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const res = await twap.health();
      setServerOnline(res.status === "ok" || res.status === "healthy");
    } catch {
      setServerOnline(false);
    }
  }, [twap]);

  // Check settlement on destination chain for an order using its intentIds
  // First fetches fresh status from server to get latest intentIds, then checks on-chain
  const checkSettlement = useCallback(async (orderId: string, destChainId: number, sourceChainId: number, knownIntentIds: string[]) => {
    setSettlementMap((prev) => ({ ...prev, [orderId]: { results: prev[orderId]?.results ?? [], checking: true } }));
    try {
      // Try to get fresh intent IDs from server if we don't have any
      let ids = knownIntentIds;
      if (ids.length === 0) {
        try {
          const fresh = await twap.getOrderStatus(orderId);
          ids = fresh.intentIds ?? [];
        } catch { /* use what we have */ }
      }
      if (ids.length === 0) {
        setSettlementMap((prev) => ({ ...prev, [orderId]: { results: [], checking: false } }));
        return;
      }
      const results = await Promise.all(
        ids.map(async (id) => {
          const solved = await settlement.isIntentSolved(destChainId, sourceChainId, BigInt(id));
          return { intentId: id, solved };
        }),
      );
      setSettlementMap((prev) => ({ ...prev, [orderId]: { results, checking: false } }));
    } catch {
      setSettlementMap((prev) => ({ ...prev, [orderId]: { results: [], checking: false } }));
    }
  }, [settlement, twap]);

  // Balance check — both chains
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [destBalances, setDestBalances] = useState<Record<string, string>>({});
  const fetchBalances = useCallback(async () => {
    if (!ready || !address) return;
    // Source tokens (Base Sepolia) — via connected wallet's public client
    const srcResults: Record<string, string> = {};
    for (const tok of SOURCE_TOKENS) {
      try {
        const bal = await approve.checkBalance(tok.address);
        srcResults[tok.symbol] = formatUnits(bal, tok.decimals);
      } catch {
        srcResults[tok.symbol] = "—";
      }
    }
    setBalances(srcResults);

    // Dest tokens (Robinhood Testnet) — cross-chain read
    const robinhoodClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });
    const dstResults: Record<string, string> = {};
    for (const tok of DEST_TOKENS) {
      try {
        const bal = await robinhoodClient.readContract({
          address: tok.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        }) as bigint;
        dstResults[tok.symbol] = formatUnits(bal, tok.decimals);
      } catch {
        dstResults[tok.symbol] = "—";
      }
    }
    setDestBalances(dstResults);
  }, [ready, address, approve]);

  // Auto-fetch on wallet connect
  useEffect(() => {
    if (ready) {
      fetchBalances();
      fetchOrders();
      checkHealth();
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredOrders = tab === "active"
    ? orders.filter((o) => o.status === "active" || o.status === "paused")
    : orders;

  return (
    <div>
      {/* ═══════════ NAV ═══════════ */}
      <nav className="fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-5 sm:px-8 border-b border-line-subtle bg-bg/80 backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image src="/logo.svg" alt="Tachyon" width={22} height={22} className="invert opacity-80" />
            <span className="font-display text-[14px] font-semibold tracking-[-0.4px] text-text-1">
              tachyon
            </span>
          </Link>
          <span className="text-text-4 text-[11px] font-mono hidden sm:inline">/ app</span>
        </div>
        <div className="flex items-center gap-4">
          {/* server indicator */}
          {/* <button
            onClick={checkHealth}
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-text-4 hover:text-text-2 transition-colors"
          >
            <span
              className={`w-[6px] h-[6px] rounded-full ${
                serverOnline === null ? "bg-text-4" : serverOnline ? "bg-green" : "bg-red"
              }`}
            />
            {serverOnline === null ? "Check server" : serverOnline ? "Online" : "Offline"}
          </button> */}
          <a
            href="https://www.tachyon.pe/mint"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-text-4 hover:text-text-2 transition-colors"
          >
            Mint
          </a>
          <ConnectButton
            chainStatus="icon"
            accountStatus="address"
            showBalance={false}
          />
        </div>
      </nav>

      {/* ═══════════ HEADER ═══════════ */}
      <section className="pt-24 sm:pt-28 pb-6 px-5">
        <div className="w-full max-w-[860px] mx-auto px-5">
          <div className="enter mb-6">
            <h1 className="font-display text-[24px] sm:text-[30px] font-semibold tracking-[-0.03em] text-text-1 mb-1">
              Dashboard
            </h1>
            <p className="text-[14px] text-text-3">
              Create and monitor private TWAP orders.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ BALANCES ═══════════ */}
      {ready && (
        <section className="w-full max-w-[860px] mx-auto px-5 pb-8">
          <div className="enter enter-d1 flex items-center justify-between mb-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-4">
              Source Balances (Base Sepolia)
            </p>
            <button
              onClick={fetchBalances}
              className="flex items-center gap-1 text-[11px] font-mono text-text-3 hover:text-text-1 transition-colors"
            >
              <RefreshIcon /> Refresh
            </button>
          </div>
          <div className="enter enter-d2 grid grid-cols-3 gap-2">
            {SOURCE_TOKENS.map((tok) => {
              const bal = balances[tok.symbol];
              const price = usd(tok.symbol);
              const usdVal = bal && price ? Number(bal) * price : null;
              return (
                <div key={tok.symbol} className="px-4 py-3 rounded-xl border border-line bg-bg-elevated">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TokenBadge symbol={tok.symbol} icon={tok.icon} size={24} />
                    <span className="font-display text-[13px] font-semibold text-text-1">{tok.symbol}</span>
                    {price && !pricesLoading && (
                      <span className="ml-auto text-[10px] font-mono text-text-4">{fmtUsd(price)}</span>
                    )}
                  </div>
                  <p className="font-mono text-[16px] text-text-1 leading-none">
                    {bal ? fmtBal(bal) : "—"}
                  </p>
                  <p className="text-[10px] text-text-4 mt-0.5">
                    {tok.name}{usdVal != null && usdVal > 0 ? ` · ${fmtUsd(usdVal)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="enter enter-d3 flex items-center justify-between mt-6 mb-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-4">
              Destination Balances (Robinhood Testnet)
            </p>
          </div>
          <div className="enter enter-d4 grid grid-cols-3 gap-2">
            {DEST_TOKENS.map((tok) => {
              const bal = destBalances[tok.symbol];
              const price = usd(tok.symbol);
              const usdVal = bal && price ? Number(bal) * price : null;
              return (
                <div key={tok.symbol} className="px-4 py-3 rounded-xl border border-line bg-bg-elevated">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TokenBadge symbol={tok.symbol} icon={tok.icon} size={24} />
                    <span className="font-display text-[13px] font-semibold text-text-1">{tok.symbol}</span>
                    {price && !pricesLoading && (
                      <span className="ml-auto text-[10px] font-mono text-text-4">{fmtUsd(price)}</span>
                    )}
                  </div>
                  <p className="font-mono text-[16px] text-text-1 leading-none">
                    {bal ? fmtBal(bal) : "—"}
                  </p>
                  <p className="text-[10px] text-text-4 mt-0.5">
                    {tok.name}{usdVal != null && usdVal > 0 ? ` · ${fmtUsd(usdVal)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════════ CREATE ORDER ═══════════ */}
      <section className="w-full max-w-[860px] mx-auto px-5 pb-10">
        <div className="enter enter-d2 flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-4 mb-1">
              New Order
            </p>
            <h2 className="font-display text-[20px] sm:text-[24px] font-semibold text-text-1 tracking-[-0.03em]">
              Create TWAP Order
            </h2>
          </div>
        </div>

        {/* Token pair selection */}
        <div className="enter enter-d3 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {/* Source token */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-4 mb-2">
              Pay with (Base Sepolia)
            </p>
            <div className="flex gap-2">
              {SOURCE_TOKENS.map((tok) => (
                <button
                  key={tok.symbol}
                  onClick={() => setSelectedSource(tok)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[13px] font-medium transition-all duration-150 ${
                    selectedSource.symbol === tok.symbol
                      ? "border-accent/40 bg-accent-dim text-text-1"
                      : "border-line bg-bg-elevated text-text-2 hover:bg-bg-surface hover:text-text-1"
                  }`}
                >
                  <TokenBadge symbol={tok.symbol} icon={tok.icon} size={22} />
                  <span className="font-display">{tok.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dest token */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-4 mb-2">
              Receive (Robinhood)
            </p>
            <div className="flex gap-2">
              {DEST_TOKENS.map((tok) => (
                <button
                  key={tok.symbol}
                  onClick={() => setSelectedDest(tok)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[13px] font-medium transition-all duration-150 ${
                    selectedDest.symbol === tok.symbol
                      ? "border-accent/40 bg-accent-dim text-text-1"
                      : "border-line bg-bg-elevated text-text-2 hover:bg-bg-surface hover:text-text-1"
                  }`}
                >
                  <TokenBadge symbol={tok.symbol} icon={tok.icon} size={22} />
                  <span className="font-display">{tok.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Open modal button */}
        <button
          onClick={() => setShowModal(true)}
          disabled={!ready}
          className="enter enter-d4 w-full sm:w-auto h-11 px-6 text-[13px] font-semibold font-display bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          <PlusIcon />
          New TWAP — {selectedSource.symbol} → {selectedDest.symbol}
        </button>
        {!ready && (
          <p className="text-[12px] text-text-4 mt-2">Connect wallet to create orders</p>
        )}
      </section>

      {/* keyline */}
      <div className="max-w-[860px] mx-auto px-5">
        <div className="h-px bg-line opacity-40" />
      </div>

      {/* ═══════════ ORDERS ═══════════ */}
      <section className="w-full max-w-[860px] mx-auto px-5 pt-10 pb-20">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-4 mb-1">
              Orders
            </p>
            <h2 className="font-display text-[20px] sm:text-[24px] font-semibold text-text-1 tracking-[-0.03em]">
              TWAP Executions
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchOrders}
              disabled={!ready}
              className="flex items-center gap-1.5 text-[12px] font-mono text-text-3 hover:text-text-1 transition-colors disabled:opacity-30"
            >
              <RefreshIcon />
              {ordersLoading ? "Loading..." : "Fetch"}
            </button>
            <div className="flex gap-1 bg-bg-surface border border-line rounded-lg p-0.5">
              {(["active", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-display font-medium rounded-md transition-all ${
                    tab === t
                      ? "bg-bg-elevated text-text-1 shadow-sm"
                      : "text-text-3 hover:text-text-1"
                  }`}
                >
                  {t === "active" ? "Active" : "All"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!ready ? (
          <div className="py-14 text-center">
            <p className="text-[13px] text-text-4 font-mono">
              Connect wallet to view orders
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-[13px] text-text-4 font-mono">
              {orders.length === 0 ? "No orders yet. Create your first TWAP order above." : "No active orders."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const isPolling = pollOrderId === order.id;
              const live = isPolling && polledStatus.status ? polledStatus.status : null;
              // Use live polled data when available to avoid stale values
              const filledCount = live?.tranchesFilled ?? order.tranchesFilled;
              const totalCount = live?.totalTranches ?? order.totalTranches;
              const spent = live?.amountSpent ?? order.amountSpent;
              const currentStatus = live?.status ?? order.status;
              const currentIntentIds = live?.intentIds ?? order.intentIds ?? [];
              const progress = totalCount > 0 ? (filledCount / totalCount) * 100 : 0;
              const srcTok = tokenFromAddress(order.assetIn);
              const dstTok = tokenFromAddress(order.assetOut);
              const srcSymbol = srcTok?.symbol ?? order.assetIn.slice(0, 6);
              const dstSymbol = dstTok?.symbol ?? order.assetOut.slice(0, 6);
              const srcIcon = srcTok?.icon;
              const dstIcon = dstTok?.icon;

              return (
                <div
                  key={order.id}
                  className="px-4 sm:px-5 py-4 rounded-xl border border-line bg-bg-elevated hover:bg-bg-surface/50 transition-colors"
                >
                  {/* top row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">
                        <TokenBadge symbol={srcSymbol} icon={srcIcon} size={28} />
                        <TokenBadge symbol={dstSymbol} icon={dstIcon} size={28} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-display text-[14px] font-semibold tracking-[-0.3px] text-text-1">
                            {srcSymbol} → {dstSymbol}
                          </p>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              currentStatus === "active"
                                ? "text-green bg-green-dim"
                                : currentStatus === "completed"
                                  ? "text-accent bg-accent-dim"
                                  : "text-text-3 bg-bg-surface"
                            }`}
                          >
                            {currentStatus}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-4 font-mono mt-0.5">
                          {order.id.slice(0, 12)}... · {order.chainIn} → {order.chainOut}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[14px] font-medium text-text-1">
                        {fmtOrderAmount(order.totalAmountIn, order.assetIn)}
                      </p>
                      <p className="text-[10px] font-mono text-text-4">
                        every {fmtInterval(order.period)}
                      </p>
                    </div>
                  </div>

                  {/* progress bar */}
                  <div className="w-full h-1 rounded-full bg-bg-surface overflow-hidden mb-2.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        currentStatus === "completed" ? "bg-accent" : "bg-green"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* bottom stats */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono">
                    <span className="text-text-3">
                      Tranches{" "}
                      <span className="text-text-1">
                        {filledCount}/{totalCount}
                      </span>
                    </span>
                    <span className="text-text-3">
                      Spent{" "}
                      <span className="text-text-1">{fmtOrderAmount(spent, order.assetIn)}</span>
                    </span>
                    <span className="text-text-3">
                      Created{" "}
                      <span className="text-text-1">{new Date(order.createdAt).toLocaleDateString()}</span>
                    </span>

                    {/* poll button */}
                    <button
                      onClick={() => setPollOrderId(isPolling ? null : order.id)}
                      className={`ml-auto text-[10px] px-2 py-0.5 rounded border transition-all ${
                        isPolling
                          ? "border-accent/40 bg-accent-dim text-accent"
                          : "border-line text-text-3 hover:text-text-1"
                      }`}
                    >
                      {isPolling ? "Polling..." : "Watch"}
                    </button>
                  </div>

                  {/* settlement check */}
                  {(() => {
                    const s = settlementMap[order.id];
                    const solvedCount = s?.results.filter((r) => r.solved).length ?? 0;
                    const totalIntents = s?.results.length ?? 0;
                    return (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => checkSettlement(order.id, order.destChainId, order.sourceChainId, currentIntentIds)}
                          disabled={s?.checking}
                          className="text-[10px] px-2.5 py-1 rounded border border-line text-text-3 hover:text-text-1 hover:border-text-3 transition-all disabled:opacity-50"
                        >
                          {s?.checking ? "Checking..." : "Check Settlement"}
                        </button>
                        {s && !s.checking && totalIntents === 0 && (
                          <span className="text-[10px] font-mono text-text-4">No intents yet</span>
                        )}
                        {s && !s.checking && totalIntents > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono ${solvedCount === totalIntents ? "text-green" : "text-text-2"}`}>
                              {solvedCount}/{totalIntents} settled
                            </span>
                            <div className="flex gap-0.5">
                              {s.results.map((r) => (
                                <div
                                  key={r.intentId}
                                  title={`Intent #${r.intentId}: ${r.solved ? "Settled" : "Pending"}`}
                                  className={`w-2 h-2 rounded-full ${r.solved ? "bg-green" : "bg-text-4/30"}`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t border-line-subtle">
        <div className="max-w-[860px] mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="Tachyon" width={14} height={14} className="invert opacity-30" />
            <span className="text-[11px] font-mono text-text-4">tachyon</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-text-4">
            <span>TEE-secured</span>
            <span className="text-line">&middot;</span>
            <span>ECIES encrypted</span>
            <span className="text-line">&middot;</span>
            <span>Base &middot; Robinhood</span>
          </div>
        </div>
      </footer>

      {/* ═══════════ MODAL ═══════════ */}
      {showModal && (
        <TwapCreateModal
          source={selectedSource}
          dest={selectedDest}
          onClose={() => setShowModal(false)}
          onCreated={(orderId) => {
            setShowModal(false);
            setPollOrderId(orderId);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   TWAP Create Modal — uses real hooks
   ───────────────────────────────────────── */

import { useCreateTwapOrder, type TwapOrderParams } from "../hooks/useCreateTwapOrder";

const DURATIONS = [
  { label: "3m", seconds: 180 },
  { label: "10m", seconds: 600 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
] as const;

const INTERVALS = [
  { label: "60s", seconds: 60 },
  { label: "2m", seconds: 120 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
] as const;

function TwapCreateModal({
  source,
  dest,
  onClose,
  onCreated,
}: {
  source: SourceToken;
  dest: DestToken;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}) {
  const createOrder = useCreateTwapOrder();
  const { convert, usd, fmtUsd } = usePrices();
  const [amount, setAmount] = useState("");
  const [durationSec, setDurationSec] = useState(180);
  const [intervalSec, setIntervalSec] = useState(60);

  const numAmount = Number(amount) || 0;
  const numTranches = intervalSec > 0 ? Math.floor(durationSec / intervalSec) : 0;
  const perTranche = numTranches > 0 && numAmount > 0 ? numAmount / numTranches : 0;

  // Price estimates
  const srcPrice = usd(source.symbol);
  const destPrice = usd(dest.symbol);
  const estOutput = numAmount > 0 ? convert(numAmount, source.symbol, dest.symbol) : null;
  const usdValue = numAmount > 0 && srcPrice ? numAmount * srcPrice : null;

  // Convert to raw units using parseUnits for precision (avoids floating point errors)
  const rawTotal = numAmount > 0
    ? parseUnits(amount, source.decimals).toString()
    : "0";
  const rawPerPeriod = numTranches > 0 && numAmount > 0
    ? (parseUnits(amount, source.decimals) / BigInt(numTranches)).toString()
    : "0";

  const submit = async () => {
    if (numAmount <= 0 || numTranches <= 0) return;

    // Calculate expected output per tranche in DEST token raw units
    // The server uses `amounts` as expectedAmountB on the bridge intent (dest token decimals)
    const perTrancheHuman = numAmount / numTranches;
    const estOutputPerTranche = convert(perTrancheHuman, source.symbol, dest.symbol);
    if (!estOutputPerTranche || estOutputPerTranche <= 0) {
      alert("Cannot estimate output — price data unavailable. Please try again.");
      return;
    }
    // Apply 2% slippage buffer (request slightly less to account for price movement)
    const withSlippage = estOutputPerTranche * 0.98;
    const expectedOutputRaw = parseUnits(withSlippage.toFixed(18), dest.decimals).toString();

    const params: TwapOrderParams = {
      assetIn: source.address,
      assetOut: dest.address,
      chainIn: "base",
      chainOut: "robinhood",
      sourceChainId: source.chainId,
      destChainId: dest.chainId,
      totalAmountIn: rawTotal,
      amountPerPeriod: rawPerPeriod,
      periodSeconds: intervalSec,
      expectedOutputPerTranche: expectedOutputRaw,
    };

    try {
      const result = await createOrder.execute(params, source.decimals);
      if (result?.orderId) {
        onCreated(result.orderId);
      }
    } catch {
      /* error shown via createOrder.error */
    }
  };

  const isDone = createOrder.step === "done";
  const isWorking = ["tee-address", "approving", "signing", "encrypting", "submitting"].includes(createOrder.step);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />

      <div
        className="enter relative w-full max-w-[460px] mx-4 bg-bg-elevated border border-line rounded-2xl overflow-hidden max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-bg-elevated z-10">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              <TokenBadge symbol={source.symbol} icon={source.icon} size={32} />
              <TokenBadge symbol={dest.symbol} icon={dest.icon} size={32} />
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-text-3">
                New Private TWAP
              </p>
              <h3 className="font-display text-[17px] font-semibold tracking-[-0.4px] text-text-1">
                {source.symbol} → {dest.symbol}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-bg-surface flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-bg-hover transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-line mx-5" />

        {isDone ? (
          <div className="px-5 py-8 text-center">
            <div className="w-11 h-11 rounded-full bg-green-dim flex items-center justify-center mx-auto mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-display text-base font-semibold text-text-1 mb-1">
              TWAP Order Created
            </p>
            <p className="text-[13px] text-text-2 mb-1">
              {numTranches} tranches of ~{perTranche.toFixed(2)} {source.symbol}
            </p>
            <p className="text-[12px] text-text-3 mb-5">
              Encrypted, submitted, and now executing privately in the TEE.
            </p>
            {createOrder.orderId && (
              <div className="bg-bg-surface rounded-lg p-3 text-left mb-5">
                <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-4 mb-1">Order ID</p>
                <p className="font-mono text-[11px] text-text-3 break-all leading-relaxed">
                  {createOrder.orderId}
                </p>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full h-10 text-[13px] font-medium font-display bg-text-1 text-bg rounded-lg hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pt-4 pb-5 space-y-4">
            {/* amount */}
            <fieldset>
              <legend className="text-[11px] font-mono uppercase tracking-[0.1em] text-text-3 mb-2">
                Total Amount ({source.symbol})
              </legend>
              <div className="relative flex items-center h-12 bg-bg-surface border border-line rounded-lg overflow-hidden focus-within:border-accent/30 transition-colors">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={source.decimals === 6 ? "300" : "0.1"}
                  min="0"
                  step="any"
                  disabled={isWorking}
                  className="flex-1 h-full bg-transparent px-3.5 text-[15px] text-text-1 font-mono placeholder:text-text-4 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pr-3.5 text-[13px] text-text-4 font-mono">{source.symbol}</span>
              </div>
            </fieldset>

            {/* duration */}
            <fieldset>
              <legend className="text-[11px] font-mono uppercase tracking-[0.1em] text-text-3 mb-2">
                Duration
              </legend>
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d.seconds}
                    onClick={() => setDurationSec(d.seconds)}
                    disabled={isWorking}
                    className={`flex-1 h-9 rounded-lg border text-[13px] font-mono transition-all duration-150 ${
                      durationSec === d.seconds
                        ? "border-accent/40 bg-accent-dim text-text-1"
                        : "border-line bg-bg-surface text-text-3 hover:bg-bg-hover hover:text-text-1"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* interval */}
            <fieldset>
              <legend className="text-[11px] font-mono uppercase tracking-[0.1em] text-text-3 mb-2">
                Slice Interval
              </legend>
              <div className="flex gap-1.5">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.seconds}
                    onClick={() => setIntervalSec(iv.seconds)}
                    disabled={isWorking}
                    className={`flex-1 h-9 rounded-lg border text-[13px] font-mono transition-all duration-150 ${
                      intervalSec === iv.seconds
                        ? "border-accent/40 bg-accent-dim text-text-1"
                        : "border-line bg-bg-surface text-text-3 hover:bg-bg-hover hover:text-text-1"
                    }`}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* slice preview */}
            {numAmount > 0 && numTranches > 0 && (
              <div className="flex items-center justify-between py-2.5 px-3.5 rounded-lg bg-accent-dim/50 border border-accent/10">
                <div>
                  <p className="text-[12px] text-text-2">{numTranches} tranches</p>
                  <p className="text-[10px] text-text-4">every {intervalSec}s</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[15px] font-medium text-accent">
                    ~{perTranche.toFixed(source.decimals === 6 ? 2 : 6)}
                  </p>
                  <p className="text-[10px] text-text-4">per tranche</p>
                </div>
              </div>
            )}

            {/* summary */}
            {numAmount > 0 && (
              <div className="bg-bg-surface rounded-lg px-4 py-3 space-y-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-text-3">Source</span>
                  <span className="font-mono text-text-1">{source.symbol} on Base Sepolia</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-text-3">Destination</span>
                  <span className="font-mono text-text-1">{dest.symbol} on Robinhood</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-text-3">Tranches</span>
                  <span className="font-mono text-text-1">{numTranches} &times; {perTranche.toFixed(2)}</span>
                </div>
                {destPrice != null && srcPrice != null && (
                  <div className="flex justify-between text-[13px]">
                    <span className="text-text-3">Rate</span>
                    <span className="font-mono text-text-1">
                      1 {dest.symbol} ≈ {fmtUsd(destPrice)}
                    </span>
                  </div>
                )}
                <div className="h-px bg-line" />
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-text-2 font-medium">Total deposit</span>
                  <div className="text-right">
                    <span className="font-display text-[17px] font-semibold text-text-1">
                      {numAmount}{" "}
                      <span className="text-[13px] font-normal text-text-2">{source.symbol}</span>
                    </span>
                    {usdValue != null && (
                      <p className="text-[11px] font-mono text-text-4">{fmtUsd(usdValue)}</p>
                    )}
                  </div>
                </div>
                {estOutput != null && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-[13px] text-text-2 font-medium">Est. output</span>
                    <div className="text-right">
                      <span className="font-display text-[17px] font-semibold text-green">
                        ~{estOutput < 0.01 ? estOutput.toPrecision(4) : estOutput.toFixed(4)}{" "}
                        <span className="text-[13px] font-normal text-text-2">{dest.symbol}</span>
                      </span>
                      <p className="text-[10px] font-mono text-text-4">at market price</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* step indicator */}
            {isWorking && (
              <div className="flex items-center gap-2 py-2 text-[12px] font-mono">
                <div className="spinner" />
                <span className="text-text-2">
                  {createOrder.step === "tee-address" && "Fetching TEE address..."}
                  {createOrder.step === "approving" && "Approving token spend..."}
                  {createOrder.step === "signing" && "Sign message to verify wallet..."}
                  {createOrder.step === "encrypting" && "Encrypting order with ECIES..."}
                  {createOrder.step === "submitting" && "Submitting to TEE..."}
                </span>
              </div>
            )}

            {/* error */}
            {createOrder.error && (
              <div className="px-3 py-2 rounded-lg bg-red-dim border border-red/10 text-[12px] text-red font-mono">
                {createOrder.error}
              </div>
            )}

            {/* cta */}
            <button
              onClick={submit}
              disabled={isWorking || numAmount <= 0 || numTranches <= 0}
              className="w-full h-11 text-[13px] font-semibold font-display bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isWorking ? "Processing..." : numAmount > 0
                ? `Deposit ${numAmount} ${source.symbol}`
                : "Enter amount"
              }
            </button>

            <p className="text-[10px] text-text-4 text-center leading-relaxed">
              Your order will be ECIES-encrypted and submitted as a private intent.
              <br />The TEE executes each tranche — no on-chain trace to your wallet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
