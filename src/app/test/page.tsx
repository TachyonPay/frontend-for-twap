"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useTwapServer } from "../hooks/useTwapServer";
import { useApproveToken } from "../hooks/useApproveToken";
import { useCreateTwapOrder, type TwapOrderParams } from "../hooks/useCreateTwapOrder";
import { useOrderStatus } from "../hooks/useOrderStatus";
import { useSettlementStatus } from "../hooks/useSettlementStatus";
import { TOKENS } from "../lib/constants";

function serialize(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() + "n" : value, 2);
}

function Log({ label, data }: { label: string; data: unknown }) {
  return (
    <div style={{ margin: "8px 0", padding: "8px", background: "#111", borderRadius: 4 }}>
      <strong>{label}:</strong>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, marginTop: 4 }}>
        {serialize(data)}
      </pre>
    </div>
  );
}

export default function TestPage() {
  const { address, isConnected } = useAccount();
  const twap = useTwapServer();
  const approveHook = useApproveToken();
  const createOrder = useCreateTwapOrder();
  const settlement = useSettlementStatus();

  // Logs
  const [logs, setLogs] = useState<{ label: string; data: unknown }[]>([]);
  const log = (label: string, data: unknown) =>
    setLogs((prev) => [{ label, data }, ...prev]);

  // Order status polling
  const [pollOrderId, setPollOrderId] = useState<string | null>(null);
  const orderStatus = useOrderStatus(pollOrderId, 5000);

  // Form state for create order
  const [formAmount, setFormAmount] = useState("300000000"); // 300 USDC in raw (6 decimals)
  const [formPerPeriod, setFormPerPeriod] = useState("100000000"); // 100 USDC
  const [formPeriod, setFormPeriod] = useState("30"); // 30 seconds

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "monospace", color: "#eee" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Tachyon TWAP — Hook Test Page</h1>

      {/* ── Wallet ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Wallet</h2>
        <ConnectButton />
        {isConnected && <p style={{ marginTop: 8, fontSize: 12 }}>Address: {address}</p>}
      </section>

      {/* ── Server Health ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>TWAP Server</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={async () => {
              try {
                const res = await twap.health();
                log("Health", res);
              } catch (e) {
                log("Health Error", String(e));
              }
            }}
            style={btnStyle}
          >
            Health Check
          </button>
          <button
            onClick={async () => {
              try {
                const res = await twap.getTeeAddress();
                log("TEE Address", res);
              } catch (e) {
                log("TEE Address Error", String(e));
              }
            }}
            style={btnStyle}
          >
            Get TEE Address
          </button>
          <button
            onClick={async () => {
              try {
                const res = await twap.getEciesPubkey();
                log("ECIES Pubkey", res);
              } catch (e) {
                log("ECIES Pubkey Error", String(e));
              }
            }}
            style={btnStyle}
          >
            Get ECIES Pubkey
          </button>
        </div>
      </section>

      {/* ── Token Balances ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Token Balances (Base Sepolia)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["USDC", "WETH", "ZEN"] as const).map((tok) => (
            <button
              key={tok}
              onClick={async () => {
                try {
                  const bal = await approveHook.checkBalance(TOKENS[tok].base as `0x${string}`);
                  log(`${tok} Balance`, `${formatUnits(bal, TOKENS[tok].decimals)} ${tok} (raw: ${bal.toString()})`);
                } catch (e) {
                  log(`${tok} Balance Error`, String(e));
                }
              }}
              style={btnStyle}
              disabled={!isConnected}
            >
              {tok} Balance
            </button>
          ))}
        </div>
      </section>

      {/* ── Approve Token ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Approve USDC to TEE</h2>
        <button
          onClick={async () => {
            try {
              log("Approve", "Getting TEE address...");
              const teeAddr = await twap.getTeeAddress();
              log("Approve", `TEE address: ${teeAddr}. Approving 300 USDC...`);
              const res = await approveHook.approve(
                TOKENS.USDC.base as `0x${string}`,
                teeAddr as `0x${string}`,
                "300",
                6,
              );
              log("Approve Result", res);
            } catch (e) {
              log("Approve Error", String(e));
            }
          }}
          style={btnStyle}
          disabled={!isConnected}
        >
          Approve 300 USDC
        </button>
        {approveHook.loading && <span style={{ marginLeft: 8, fontSize: 12 }}>Approving...</span>}
        {approveHook.error && <span style={{ marginLeft: 8, fontSize: 12, color: "#f55" }}>{approveHook.error}</span>}
      </section>

      {/* ── Create TWAP Order ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Create TWAP Order</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxWidth: 400 }}>
          <label style={{ fontSize: 12 }}>
            Total Amount (raw USDC, 6 decimals):
            <input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            Amount Per Period (raw):
            <input value={formPerPeriod} onChange={(e) => setFormPerPeriod(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            Period (seconds):
            <input value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)} style={inputStyle} />
          </label>
        </div>
        <button
          onClick={async () => {
            try {
              const params: TwapOrderParams = {
                assetIn: TOKENS.USDC.base as `0x${string}`,
                assetOut: TOKENS.WETH.robinhood as `0x${string}`,
                chainIn: "base",
                chainOut: "robinhood",
                sourceChainId: 84532,
                destChainId: 46630,
                totalAmountIn: formAmount,
                amountPerPeriod: formPerPeriod,
                periodSeconds: Number(formPeriod),
                expectedOutputPerTranche: formPerPeriod, // test page: use same value as input
              };
              log("Create Order", `Step: starting with params ${JSON.stringify(params)}`);
              const result = await createOrder.execute(params, 6);
              log("Create Order Result", result);
              if (result?.orderId) {
                setPollOrderId(result.orderId);
              }
            } catch (e) {
              log("Create Order Error", String(e));
            }
          }}
          style={btnStyle}
          disabled={!isConnected || createOrder.step === "submitting" || createOrder.step === "approving"}
        >
          Submit TWAP Order
        </button>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Step: <strong>{createOrder.step}</strong>
          {createOrder.orderId && <> | Order ID: {createOrder.orderId}</>}
          {createOrder.error && <span style={{ color: "#f55" }}> | {createOrder.error}</span>}
        </p>
      </section>

      {/* ── Order Status Polling ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Order Status (polling)</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input
            placeholder="Order ID to poll"
            value={pollOrderId ?? ""}
            onChange={(e) => setPollOrderId(e.target.value || null)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => setPollOrderId(null)} style={btnStyle}>Stop</button>
          <button onClick={() => orderStatus.refresh()} style={btnStyle}>Refresh</button>
        </div>
        {orderStatus.status && <Log label="Status" data={orderStatus.status} />}
        {orderStatus.error && <p style={{ fontSize: 12, color: "#f55" }}>Error: {orderStatus.error}</p>}
      </section>

      {/* ── User Orders ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>My Orders</h2>
        <button
          onClick={async () => {
            if (!address) return;
            try {
              const orders = await twap.getUserOrders(address);
              log("User Orders", orders);
            } catch (e) {
              log("User Orders Error", String(e));
            }
          }}
          style={btnStyle}
          disabled={!isConnected}
        >
          Fetch My Orders
        </button>
      </section>

      {/* ── Cancel Order ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Cancel Order</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Order ID"
            id="cancel-order-id"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={async () => {
              const id = (document.getElementById("cancel-order-id") as HTMLInputElement)?.value;
              if (!id) return;
              try {
                const res = await twap.cancelOrder(id);
                log("Cancel Result", res);
              } catch (e) {
                log("Cancel Error", String(e));
              }
            }}
            style={btnStyle}
          >
            Cancel
          </button>
        </div>
      </section>

      {/* ── Settlement Status (On-Chain) ── */}
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Settlement Status (On-Chain)</h2>
        <p style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
          Reads bridge contract to check if intent is solved on destination chain
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={async () => {
              try {
                const id = await settlement.getLatestIntentId(84532);
                log("Latest Intent ID (Base)", id.toString());
              } catch (e) { log("Error", String(e)); }
            }}
            style={btnStyle}
          >
            Latest Intent (Base)
          </button>
          <button
            onClick={async () => {
              try {
                const id = await settlement.getLatestIntentId(46630);
                log("Latest Intent ID (Robinhood)", id.toString());
              } catch (e) { log("Error", String(e)); }
            }}
            style={btnStyle}
          >
            Latest Intent (Robinhood)
          </button>
        </div>

        {/* Check single intent settlement */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>
            Source Chain ID
            <input id="settle-source" defaultValue="84532" style={{ ...inputStyle, width: 100 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Dest Chain ID
            <input id="settle-dest" defaultValue="46630" style={{ ...inputStyle, width: 100 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Intent ID
            <input id="settle-intent" placeholder="e.g. 1" style={{ ...inputStyle, width: 100 }} />
          </label>
          <button
            onClick={async () => {
              const src = Number((document.getElementById("settle-source") as HTMLInputElement).value);
              const dest = Number((document.getElementById("settle-dest") as HTMLInputElement).value);
              const intentId = (document.getElementById("settle-intent") as HTMLInputElement).value;
              if (!intentId) return;
              try {
                const solved = await settlement.isIntentSolved(dest, src, BigInt(intentId));
                log(`Intent ${intentId} Solved?`, solved ? "YES — settled on destination" : "NO — not yet settled");
              } catch (e) { log("Settlement Check Error", String(e)); }
            }}
            style={btnStyle}
          >
            Check Solved
          </button>
        </div>

        {/* Get intent details */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12 }}>
            Chain ID
            <input id="intent-chain" defaultValue="84532" style={{ ...inputStyle, width: 100 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Intent ID
            <input id="intent-id" placeholder="e.g. 1" style={{ ...inputStyle, width: 100 }} />
          </label>
          <button
            onClick={async () => {
              const chainId = Number((document.getElementById("intent-chain") as HTMLInputElement).value);
              const intentId = (document.getElementById("intent-id") as HTMLInputElement).value;
              if (!intentId) return;
              try {
                const info = await settlement.getIntent(chainId, BigInt(intentId));
                log(`Intent ${intentId} Details`, info);
              } catch (e) { log("Get Intent Error", String(e)); }
            }}
            style={btnStyle}
          >
            Get Intent Details
          </button>
        </div>
      </section>

      {/* ── Logs ── */}
      <section style={{ padding: 16, border: "1px solid #333", borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16 }}>Logs ({logs.length})</h2>
          <button onClick={() => setLogs([])} style={btnStyle}>Clear</button>
        </div>
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          {logs.map((l, i) => (
            <Log key={i} label={l.label} data={l.data} />
          ))}
          {logs.length === 0 && <p style={{ fontSize: 12, color: "#666" }}>No logs yet. Click buttons above to test hooks.</p>}
        </div>
      </section>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  background: "#222",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 8px",
  fontSize: 12,
  background: "#111",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  marginTop: 4,
};
