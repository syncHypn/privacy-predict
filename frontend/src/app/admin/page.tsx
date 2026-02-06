"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { useCreateMarket, type MarketMetadata } from "@/lib/hooks/useCreateMarket";
import { api } from "@/lib/api";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { MarketFactoryABI } from "@/lib/contracts/abis/MarketFactory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { EnrichedMarket } from "@/types/market";

const CATEGORIES = ["Crypto", "Sports", "Politics", "Tech", "Finance", "Science", "Entertainment", "Other"];

export default function AdminPage() {
  const { user, authenticated, login } = usePrivy();
  const address = user?.wallet?.address as `0x${string}` | undefined;

  const { data: isWhitelisted } = useReadContract({
    address: ADDRESSES.MarketFactory as `0x${string}`,
    abi: MarketFactoryABI,
    functionName: "whitelisted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: owner } = useReadContract({
    address: ADDRESSES.MarketFactory as `0x${string}`,
    abi: MarketFactoryABI,
    functionName: "owner",
  });

  const isAdmin =
    !!address &&
    (isWhitelisted === true ||
      owner?.toLowerCase() === address.toLowerCase());

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-lg text-muted-foreground">
          Connect your wallet to access the admin panel
        </p>
        <Button onClick={login} className="bg-primary text-primary-foreground hover:bg-primary/90">
          Connect
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg text-muted-foreground">Access denied</p>
        <p className="text-sm text-muted-foreground">
          Only whitelisted admins can access this panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin</h1>
        <p className="text-muted-foreground">Create and manage prediction markets</p>
      </div>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="create">Create Market</TabsTrigger>
          <TabsTrigger value="manage">Manage Markets</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="mx-auto max-w-2xl">
            <CreateMarketTab />
          </div>
        </TabsContent>

        <TabsContent value="manage">
          <ManageMarketsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Create Market Tab ─── */

function CreateMarketTab() {
  const { authenticated, login } = usePrivy();
  const [question, setQuestion] = useState("");
  const [outcome1, setOutcome1] = useState("Yes");
  const [outcome2, setOutcome2] = useState("No");
  const [resolutionDate, setResolutionDate] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const { createMarket, isPending, isConfirmed, txHash, marketId } = useCreateMarket();

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
    const metadata: MarketMetadata = {
      description: description || undefined,
      category: category || undefined,
      imageUrl: imageUrl || undefined,
    };
    createMarket(question, [outcome1, outcome2], resolutionTime, metadata);
    toast.info("Creating market...");
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">New Market</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question */}
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide additional context about the market..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-secondary border-border"
              rows={3}
            />
          </div>

          {/* Category + Image */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          </div>

          {/* Outcomes */}
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

          {/* Resolution date */}
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

          {/* Success feedback */}
          {isConfirmed && txHash && (
            <div className="rounded-lg bg-[var(--color-yes)]/10 p-4 text-sm space-y-1">
              <p className="text-[var(--color-yes)]">Market created!</p>
              {marketId && (
                <p className="text-muted-foreground text-xs break-all">
                  Market ID: {marketId}
                </p>
              )}
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
            {isPending ? "Creating..." : "Create Market"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ─── Manage Markets Tab ─── */

function ManageMarketsTab() {
  const { markets, isLoading } = useMarkets();
  const [selected, setSelected] = useState<EnrichedMarket | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Market list */}
      <div className="space-y-2 lg:col-span-1">
        <h2 className="text-lg font-semibold text-foreground">Markets</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : markets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No markets yet. Create one first.</p>
        ) : (
          <div className="space-y-2">
            {markets.map((m) => (
              <button
                key={m.marketId}
                onClick={() => setSelected(m)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selected?.marketId === m.marketId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <p className="text-sm font-medium text-foreground line-clamp-2">
                  {m.question}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {m.category ?? "no category"} {m.featured ? "• featured" : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="lg:col-span-2">
        {selected ? (
          <MetadataEditor market={selected} key={selected.marketId} />
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center justify-center py-24">
              <p className="text-muted-foreground">
                Select a market to edit its metadata
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─── Metadata Editor ─── */

function MetadataEditor({ market }: { market: EnrichedMarket }) {
  const { getAccessToken } = usePrivy();
  const [imageUrl, setImageUrl] = useState(market.imageUrl ?? "");
  const [description, setDescription] = useState(market.description ?? "");
  const [category, setCategory] = useState(market.category ?? "");
  const [featured, setFeatured] = useState(market.featured);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error("Not authenticated");
        setSaving(false);
        return;
      }
      await api.updateMetadata(
        market.marketId,
        {
          imageUrl: imageUrl || null,
          description: description || null,
          category: category || null,
          featured,
        },
        token
      );
      toast.success("Metadata updated");
    } catch (err) {
      toast.error("Failed to update metadata");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg">{market.question}</CardTitle>
        <p className="text-xs text-muted-foreground font-mono">
          {market.marketId}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Image URL</Label>
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="bg-secondary border-border"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Market description..."
            rows={3}
            className="bg-secondary border-border"
          />
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="featured"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="rounded border-border"
          />
          <Label htmlFor="featured">Featured</Label>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? "Saving..." : "Save Metadata"}
        </Button>
      </CardContent>
    </Card>
  );
}
