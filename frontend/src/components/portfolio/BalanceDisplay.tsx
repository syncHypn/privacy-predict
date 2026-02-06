"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUSDCBalance } from "@/lib/hooks/useUSDCBalance";
import { useReadContract } from "wagmi";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { PrivateTokenABI } from "@/lib/contracts/abis/PrivateToken";
import { formatUSDC } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceDisplayProps {
  address: `0x${string}` | undefined;
}

export function BalanceDisplay({ address }: BalanceDisplayProps) {
  const { balance: usdcBalance, isLoading: usdcLoading } = useUSDCBalance(address);

  const { data: encBalance, isLoading: encLoading } = useReadContract({
    address: ADDRESSES.PrivateToken as `0x${string}`,
    abi: PrivateTokenABI,
    functionName: "getEncryptedBalance",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const hasEncryptedBalance =
    encBalance && (encBalance as `0x${string}`) !== "0x";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Wallet USDC
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usdcLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold text-foreground">
              {usdcBalance ? formatUSDC(usdcBalance) : "0.00"}
              <span className="ml-1 text-sm text-muted-foreground">USDC</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Private Balance (cUSDC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {encLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg">&#x1f512;</span>
              <span className="text-lg font-medium text-muted-foreground">
                {hasEncryptedBalance ? "Encrypted" : "No balance"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
