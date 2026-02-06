"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useCreateMarket } from "@/lib/hooks/useCreateMarket";
import { toast } from "sonner";

export function CreateMarketForm() {
  const { authenticated, login } = usePrivy();
  const [question, setQuestion] = useState("");
  const [outcome1, setOutcome1] = useState("Yes");
  const [outcome2, setOutcome2] = useState("No");
  const [resolutionDate, setResolutionDate] = useState("");
  const { createMarket, isPending, isConfirmed, error, txHash } = useCreateMarket();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authenticated) {
      login();
      return;
    }
    if (!question || !resolutionDate) return;

    const resolutionTime = BigInt(
      Math.floor(new Date(resolutionDate).getTime() / 1000)
    );
    createMarket(question, [outcome1, outcome2], resolutionTime);
    toast.info("Creating market...");
  }

  if (isConfirmed) {
    toast.success("Market created successfully!");
  }
  if (error) {
    toast.error(`Market creation failed: ${error.message}`);
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">Create a Market</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="question">Question</Label>
            <Textarea
              id="question"
              placeholder="Will BTC reach $100k by end of 2025?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="bg-secondary border-border"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outcome1">Outcome 1</Label>
              <Input
                id="outcome1"
                value={outcome1}
                onChange={(e) => setOutcome1(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outcome2">Outcome 2</Label>
              <Input
                id="outcome2"
                value={outcome2}
                onChange={(e) => setOutcome2(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resolution">Resolution Date</Label>
            <Input
              id="resolution"
              type="datetime-local"
              value={resolutionDate}
              onChange={(e) => setResolutionDate(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          {isConfirmed && txHash && (
            <div className="rounded-lg bg-[var(--color-yes)]/10 p-4 text-sm">
              <p className="text-[var(--color-yes)]">Market created!</p>
              <a
                href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                View on Arbiscan
              </a>
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending || !question || !resolutionDate}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {!authenticated
              ? "Connect to Create"
              : isPending
              ? "Creating..."
              : "Create Market"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Requires whitelist access on MarketFactory
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
