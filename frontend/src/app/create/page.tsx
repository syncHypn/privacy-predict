"use client";

import { CreateMarketForm } from "@/components/create/CreateMarketForm";

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Create Market
        </h1>
        <p className="text-muted-foreground">
          Create a new prediction market. Requires whitelist access.
        </p>
      </div>

      <CreateMarketForm />
    </div>
  );
}
