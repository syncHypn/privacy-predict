"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubmitOrder } from "@/lib/hooks/useSubmitOrder";
import { useUSDCBalance } from "@/lib/hooks/useUSDCBalance";
import { formatUSDC } from "@/lib/utils";

interface TradingPanelProps {
  marketId: `0x${string}`;
  question: string;
}

export function TradingPanel({ marketId, question }: TradingPanelProps) {
  const { authenticated, login, user } = usePrivy();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const { submitOrder, isProcessing, step } = useSubmitOrder();
  const address = user?.wallet?.address as `0x${string}` | undefined;
  const { balance } = useUSDCBalance(address);

  function handleSubmit() {
    if (!authenticated) {
      login();
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    const outcomeIndex = side === "YES" ? 0 : 1;
    submitOrder(marketId, "BUY", outcomeIndex, amount).catch(() => {});
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Trade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Side Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={side === "YES" ? "default" : "outline"}
              onClick={() => setSide("YES")}
              className={
                side === "YES"
                  ? "bg-[var(--color-yes)] text-white hover:bg-[var(--color-yes)]/90"
                  : "border-[var(--color-yes)]/30 text-[var(--color-yes)] hover:bg-[var(--color-yes)]/10"
              }
            >
              Yes
            </Button>
            <Button
              variant={side === "NO" ? "default" : "outline"}
              onClick={() => setSide("NO")}
              className={
                side === "NO"
                  ? "bg-[var(--color-no)] text-white hover:bg-[var(--color-no)]/90"
                  : "border-[var(--color-no)]/30 text-[var(--color-no)] hover:bg-[var(--color-no)]/10"
              }
            >
              No
            </Button>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">
                Amount (USDC)
              </label>
              {balance !== undefined && authenticated && (
                <button
                  type="button"
                  onClick={() => setAmount(formatUSDC(balance))}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  Max: {formatUSDC(balance)}
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              className="bg-secondary border-border"
            />
          </div>

          {/* Estimated payout */}
          {amount && parseFloat(amount) > 0 && (
            <div className="rounded-lg bg-secondary/50 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated shares</span>
                <span className="text-foreground">
                  ~{(parseFloat(amount) / 0.5).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Max payout</span>
                <span className="text-foreground">
                  ~{(parseFloat(amount) / 0.5).toFixed(2)} USDC
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || !amount}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {!authenticated
              ? "Connect to Trade"
              : isProcessing
              ? "Submitting..."
              : `Buy ${side}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Orders are encrypted and processed by TEE
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirm Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Your order will be encrypted and submitted to the OrderQueue contract.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg bg-secondary/50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Market</span>
              <span className="max-w-[200px] truncate text-foreground">{question}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Side</span>
              <span
                className={
                  side === "YES" ? "text-[var(--color-yes)]" : "text-[var(--color-no)]"
                }
              >
                {side}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="text-foreground">{amount} USDC</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Confirm Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
