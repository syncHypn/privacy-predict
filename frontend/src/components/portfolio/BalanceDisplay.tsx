"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import nacl from "tweetnacl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUSDCBalance } from "@/lib/hooks/useUSDCBalance";
import { api } from "@/lib/api";
import { formatUSDC } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceDisplayProps {
  address: `0x${string}` | undefined;
}

const CACHE_KEY_PREFIX = "ipred_cusdc_";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function getCachedBalance(address: string): number | null {
  try {
    const raw = localStorage.getItem(
      `${CACHE_KEY_PREFIX}${address.toLowerCase()}`
    );
    if (raw === null) return null;
    return parseFloat(raw);
  } catch {
    return null;
  }
}

function setCachedBalance(address: string, value: number) {
  try {
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${address.toLowerCase()}`,
      String(value)
    );
  } catch {}
}

export function BalanceDisplay({ address }: BalanceDisplayProps) {
  const { balance: usdcBalance, isLoading: usdcLoading } =
    useUSDCBalance(address);

  const { data: deposits } = useQuery({
    queryKey: ["deposits", address],
    queryFn: () => api.getDeposits(address!),
    enabled: !!address,
  });

  const { signMessageAsync } = useSignMessage();

  const [confidentialBalance, setConfidentialBalance] = useState<number | null>(
    null
  );
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Load cached balance on mount
  useEffect(() => {
    if (address) {
      const cached = getCachedBalance(address);
      setConfidentialBalance(cached);
    }
  }, [address]);

  const handleCheckBalance = useCallback(async () => {
    if (!address) return;

    setQuerying(true);
    setQueryError(null);

    try {
      // 1. Generate ephemeral NaCl keypair
      const keyPair = nacl.box.keyPair();
      const userNaclPubkey = bytesToHex(keyPair.publicKey);

      // 2. Sign message with Ethereum wallet
      const message = `iPred balance query: ${address.toLowerCase()}`;
      const signature = await signMessageAsync({ message });

      // 3. Call API (triggers iExec TEE run)
      const res = await fetch("/api/balance-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          signature,
          userNaclPubkey,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Balance query failed");
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "TEE returned error");
      }

      // No balance on chain
      if (!data.encrypted) {
        setConfidentialBalance(0);
        setCachedBalance(address, 0);
        return;
      }

      // 4. Decrypt the response with our ephemeral secret key
      const nonce = hexToBytes(data.encrypted.nonce);
      const ciphertext = hexToBytes(data.encrypted.ciphertext);
      const teePublicKey = hexToBytes(data.encrypted.teePublicKey);

      const decrypted = nacl.box.open(
        ciphertext,
        nonce,
        teePublicKey,
        keyPair.secretKey
      );

      if (!decrypted) {
        throw new Error("Failed to decrypt TEE response");
      }

      const balances = JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, string>;

      // Extract cUSDC balance (primary) — values are in raw units (6 decimals)
      const cusdcRaw = BigInt(balances["cUSDC"] || "0");
      const cusdcValue = Number(cusdcRaw) / 1e6;

      // 5. Cache and display
      setConfidentialBalance(cusdcValue);
      setCachedBalance(address, cusdcValue);
    } catch (err) {
      console.error("Balance query failed:", err);
      setQueryError(
        err instanceof Error ? err.message : "Balance query failed"
      );
    } finally {
      setQuerying(false);
    }
  }, [address, signMessageAsync]);

  // P&L computation
  const netDeposited = deposits ? Number(deposits.netDeposited) / 1e6 : null;
  const pnl =
    confidentialBalance !== null && netDeposited !== null
      ? confidentialBalance - netDeposited
      : null;
  const pnlPercent =
    pnl !== null && netDeposited !== null && netDeposited > 0
      ? (pnl / netDeposited) * 100
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Wallet USDC */}
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

      {/* Confidential Balance */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Confidential Balance (cUSDC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {confidentialBalance !== null ? (
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-foreground">
                {confidentialBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                <span className="ml-1 text-sm text-muted-foreground">
                  cUSDC
                </span>
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleCheckBalance}
                disabled={querying}
              >
                {querying ? "Querying..." : "Refresh"}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleCheckBalance}
              disabled={querying}
            >
              {querying ? "Querying TEE..." : "Check Balance"}
            </Button>
          )}
          {querying && (
            <p className="mt-1 text-xs text-muted-foreground animate-pulse">
              Requesting balance from TEE enclave...
            </p>
          )}
          {queryError && (
            <p className="mt-1 text-xs text-[var(--color-no)]">
              {queryError}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Decrypted via TEE, cached locally
          </p>
        </CardContent>
      </Card>

      {/* P&L */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            P&L
          </CardTitle>
        </CardHeader>
        <CardContent>
          {confidentialBalance === null ? (
            <p className="text-sm text-muted-foreground">
              Check your balance to see P&L
            </p>
          ) : pnl !== null ? (
            <div>
              <p
                className={`text-2xl font-bold ${
                  pnl >= 0
                    ? "text-[var(--color-yes)]"
                    : "text-[var(--color-no)]"
                }`}
              >
                {pnl >= 0 ? "+" : ""}
                {pnl.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                <span className="ml-1 text-sm">cUSDC</span>
              </p>
              {pnlPercent !== null && (
                <p
                  className={`text-sm ${
                    pnl >= 0
                      ? "text-[var(--color-yes)]"
                      : "text-[var(--color-no)]"
                  }`}
                >
                  {pnl >= 0 ? "+" : ""}
                  {pnlPercent.toFixed(2)}%
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Net deposited:{" "}
                {netDeposited?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                USDC
              </p>
            </div>
          ) : (
            <Skeleton className="h-8 w-24" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
