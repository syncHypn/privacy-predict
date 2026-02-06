"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWithdraw } from "@/lib/hooks/useWithdraw";
import { useAppStore } from "@/store/useAppStore";

export function WithdrawModal() {
  const open = useAppStore((s) => s.withdrawModalOpen);
  const setOpen = useAppStore((s) => s.setWithdrawModalOpen);
  const [amount, setAmount] = useState("");
  const { user } = usePrivy();
  const { executeWithdraw, step, isProcessing } = useWithdraw();

  const isEmbedded = user?.wallet?.walletClientType === "privy";

  function handleWithdraw() {
    if (!amount || parseFloat(amount) <= 0) return;

    executeWithdraw(amount).catch(() => {
      // Already handled inside executeWithdraw — this .catch()
      // prevents SES/Privy from flagging an unhandled rejection
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-card border-border sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Withdraw</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Request a withdrawal. The TEE will verify your encrypted balance and
            release funds to your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Amount (USDC)
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              disabled={isProcessing}
              className="bg-secondary border-border"
            />
          </div>

          {/* Processing spinner */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-3 py-3">
              <Spinner />
              <span className="text-sm text-muted-foreground">
                {isEmbedded
                  ? "Processing withdrawal..."
                  : "Submitting withdrawal request..."}
              </span>
            </div>
          )}

          <div className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            Withdrawals are processed by the TEE in the next matching cycle.
            Funds will appear in your wallet once verified.
          </div>

          <Button
            onClick={step === "done" ? () => setOpen(false) : handleWithdraw}
            disabled={isProcessing || (step !== "done" && (!amount || parseFloat(amount) <= 0))}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isProcessing
              ? "Processing..."
              : step === "done"
                ? "Done!"
                : "Withdraw"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin text-primary"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-20"
      />
      <path
        d="M12 2a10 10 0 019.17 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
