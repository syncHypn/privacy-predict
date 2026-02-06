import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All pages use Privy/wagmi which need browser runtime
  // so we skip static generation
  output: undefined,
  serverExternalPackages: ["iexec"],
};

export default nextConfig;
