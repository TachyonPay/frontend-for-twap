import { defineChain } from "viem";

/* ─────────────────────────────────────────
   Chains
   ───────────────────────────────────────── */

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://sepolia-explorer.base.org",
    },
  },
  testnet: true,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

/* ─────────────────────────────────────────
   Token addresses
   ───────────────────────────────────────── */

export const TOKENS = {
  USDC: {
    base: "0x39b2DfD00D262B7A8d83468C244901c2c1252256" as const,
    robinhood: "0xdE7E8Bf319c7293484C087D1f585e1ABe40A52aB" as const,
    decimals: 6,
  },
  WETH: {
    base: "0x04FAD9adBB9aE63b305aE3c91B027D095487A9e2" as const,
    robinhood: "0x953648F04C23b1b36DdE33A1B161ea9554a3705A" as const,
    decimals: 18,
  },
  ZEN: {
    base: "0xE991595dfd6A4b8f9C308cA3a9d469bF76FcA7Da" as const,
    robinhood: "0x28DE155aA97461755A1C6829AA8A17FA867b391C" as const,
    decimals: 18,
  },
  TSLA: {
    robinhood: "0x0BDe6726c5E2D29246501472cCca6D487aaf4CAb" as const,
    decimals: 18,
  },
  AMZN: {
    robinhood: "0xf5700ae4D2969bF18b340A455B49D0459e732Cb2" as const,
    decimals: 18,
  },
} as const;

/* ─────────────────────────────────────────
   UI Token Config — source & destination
   ───────────────────────────────────────── */

export type SourceToken = {
  symbol: string;
  name: string;
  icon: string;
  address: `0x${string}`;
  chainId: number;
  decimals: number;
};

export type DestToken = {
  symbol: string;
  name: string;
  icon: string;
  address: `0x${string}`;
  chainId: number;
  decimals: number;
};

export const SOURCE_TOKENS: SourceToken[] = [
  { symbol: "USDC", name: "USD Coin", icon: "/tokens/usdc.png", address: TOKENS.USDC.base, chainId: 84532, decimals: 6 },
  { symbol: "ETH", name: "Ether", icon: "/tokens/eth.svg", address: TOKENS.WETH.base, chainId: 84532, decimals: 18 },
  { symbol: "ZEN", name: "Horizen", icon: "/tokens/zen.svg", address: TOKENS.ZEN.base, chainId: 84532, decimals: 18 },
];

export const DEST_TOKENS: DestToken[] = [
  { symbol: "TSLA", name: "Tesla", icon: "/stocks/tesla.png", address: TOKENS.TSLA.robinhood, chainId: 46630, decimals: 18 },
  { symbol: "AMZN", name: "Amazon", icon: "/stocks/amzn.svg", address: TOKENS.AMZN.robinhood, chainId: 46630, decimals: 18 },
];

/* ─────────────────────────────────────────
   Bridge contracts
   ───────────────────────────────────────── */

export const BRIDGES = {
  base: "0x1628Ae09a5f49b8A6B3Ec4Ca20c4C4a40017e13D" as const,
  robinhood: "0xDA539ab7A006661F9F1cFeF285f6f71FED09E44E" as const,
} as const;

/* ─────────────────────────────────────────
   TWAP server
   ───────────────────────────────────────── */

export const TWAP_SERVER_URL =
  process.env.NEXT_PUBLIC_TWAP_URL || "http://localhost:3002";

/* ─────────────────────────────────────────
   Bridge ABI (minimal — settlement checks)
   ───────────────────────────────────────── */

export const BRIDGE_ABI = [
  {
    name: "isIntentSolvedOnChain2",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_sourceChainId", type: "uint256" },
      { name: "_intentId", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getLatestIntentId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getIntent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_intentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "tokenA", type: "address" },
          { name: "amountA", type: "uint256" },
          { name: "tokenB", type: "address" },
          { name: "amountB", type: "uint256" },
          { name: "destinationChainId", type: "uint256" },
          { name: "recipients", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

/* ─────────────────────────────────────────
   ERC20 ABI (minimal)
   ───────────────────────────────────────── */

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
