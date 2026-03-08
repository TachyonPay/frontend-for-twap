"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { baseSepolia, robinhoodTestnet } from "./lib/constants";
import { useState, type ReactNode } from "react";
import { PriceProvider } from "./lib/PriceProvider";

const config = createConfig({
  chains: [baseSepolia, robinhoodTestnet],
  transports: {
    [baseSepolia.id]: http(),
    [robinhoodTestnet.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#5e6ad2",
            borderRadius: "medium",
          })}
        >
          <PriceProvider>{children}</PriceProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
