"use client";

import { usePrivy } from "@privy-io/react-auth";
import { BalanceDisplay } from "@/components/portfolio/BalanceDisplay";
import { OrderHistory } from "@/components/portfolio/OrderHistory";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";

export default function PortfolioPage() {
  const { authenticated, login, user } = usePrivy();
  const setDepositModalOpen = useAppStore((s) => s.setDepositModalOpen);
  const setWithdrawModalOpen = useAppStore((s) => s.setWithdrawModalOpen);

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-lg text-muted-foreground">
          Connect your wallet to view your portfolio
        </p>
        <Button
          onClick={login}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Connect
        </Button>
      </div>
    );
  }

  const address = user?.wallet?.address as `0x${string}` | undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Portfolio</h1>
          <p className="text-muted-foreground">
            Your balances and order history
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setDepositModalOpen(true)}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            Deposit
          </Button>
          <Button
            variant="outline"
            onClick={() => setWithdrawModalOpen(true)}
            className="border-border text-foreground hover:bg-secondary"
          >
            Withdraw
          </Button>
        </div>
      </div>

      <BalanceDisplay address={address} />
      <OrderHistory address={address} />
    </div>
  );
}
