export const CHAIN_ID = 421614;

export const USDC_DECIMALS = 6;

export const PRICE_SCALE = 10000; // 1e4 — prices are 0-10000 representing 0%-100%

export const ARBITRUM_SEPOLIA = {
  id: 421614,
  name: "Arbitrum Sepolia",
  network: "arbitrum-sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://sepolia-rollup.arbitrum.io/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arbiscan",
      url: "https://sepolia.arbiscan.io",
    },
  },
  testnet: true,
} as const;
