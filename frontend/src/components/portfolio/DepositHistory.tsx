"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { TransferRecord } from "@/lib/services/deposit.service";

const EXPLORER_URL = "https://sepolia.arbiscan.io";

function formatUSDCRaw(raw: string): string {
  const n = Number(raw) / 1e6;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function TransferRow({ t }: { t: TransferRecord }) {
  const ts = new Date(Number(t.blockTimestamp) * 1000);
  const isDeposit = t.type === "deposit";
  const isProcessed = t.type === "withdrawal_processed";

  let label: string;
  let color: string;
  let sign: string;

  if (isDeposit) {
    label = "Deposit";
    color = "text-[var(--color-yes)]";
    sign = "+";
  } else if (isProcessed) {
    label = "Withdrawal";
    color = "text-[var(--color-no)]";
    sign = "-";
  } else {
    label = "Withdrawal Pending";
    color = "text-muted-foreground";
    sign = "";
  }

  return (
    <a
      href={`${EXPLORER_URL}/tx/${t.transactionHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-4 gap-4 rounded-md px-2 -mx-2 py-2 text-sm cursor-pointer transition-colors hover:bg-secondary/50"
    >
      <span className={`font-medium ${color}`}>{label}</span>
      <span className={`${color} font-mono`}>
        {t.amount ? `${sign}${formatUSDCRaw(t.amount)} USDC` : "Encrypted"}
      </span>
      <span className="text-muted-foreground">
        {ts.toLocaleDateString()}
      </span>
      <span className="flex items-center text-muted-foreground">
        {t.transactionHash.slice(0, 10)}...
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className="ml-1 text-muted-foreground"
        >
          <path
            d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </a>
  );
}

interface DepositHistoryProps {
  address: string | undefined;
}

export function DepositHistory({ address }: DepositHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["deposits", address],
    queryFn: () => api.getDeposits(address!),
    enabled: !!address,
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg">Deposit & Withdrawal History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.transfers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No deposits or withdrawals yet.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-4 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
              <span>Type</span>
              <span>Amount</span>
              <span>Date</span>
              <span>Tx</span>
            </div>
            {data.transfers.map((t, i) => (
              <TransferRow key={`${t.transactionHash}-${i}`} t={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
