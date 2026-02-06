"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "@privy-io/wagmi";
import { wagmiConfig } from "./wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { useState, type ReactNode } from "react";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "placeholder-app-id";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#FCD15A",
        },
        loginMethods: ["email"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          showWalletUIs: false,
        },
        defaultChain: arbitrumSepolia,
        supportedChains: [arbitrumSepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
