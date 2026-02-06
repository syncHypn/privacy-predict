"use client";

import { writeContract, waitForTransactionReceipt, switchChain } from "wagmi/actions";
import { decodeEventLog } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { wagmiConfig } from "../wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { MarketFactoryABI } from "../contracts/abis/MarketFactory";
import { getGasOverrides } from "../gas";
import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

type Step = "idle" | "processing" | "done";

export interface MarketMetadata {
  description?: string;
  category?: string;
  imageUrl?: string;
}

export function useCreateMarket() {
  const { getAccessToken } = usePrivy();
  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [marketId, setMarketId] = useState<string | undefined>();

  const createMarket = useCallback(
    async (
      question: string,
      outcomes: string[],
      resolutionTime: bigint,
      metadata?: MarketMetadata
    ) => {
      setStep("processing");

      try {
        await switchChain(wagmiConfig, { chainId: arbitrumSepolia.id });

        const gas = await getGasOverrides();
        const hash = await writeContract(wagmiConfig, {
          chainId: arbitrumSepolia.id,
          address: ADDRESSES.MarketFactory as `0x${string}`,
          abi: MarketFactoryABI,
          functionName: "createMarket",
          args: [question, outcomes, resolutionTime],
          ...gas,
        });

        setTxHash(hash);

        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status === "reverted") {
          throw new Error("Market creation reverted");
        }

        // Extract marketId from MarketCreated event
        let createdMarketId: string | undefined;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: MarketFactoryABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "MarketCreated") {
              createdMarketId = (decoded.args as { marketId: string }).marketId;
              break;
            }
          } catch {
            // Not a MarketCreated event, skip
          }
        }

        setMarketId(createdMarketId);

        // Save metadata if provided and marketId was extracted
        if (createdMarketId && metadata && (metadata.description || metadata.category || metadata.imageUrl)) {
          try {
            const token = await getAccessToken();
            await fetch(`/api/markets/${createdMarketId}/metadata`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                description: metadata.description || null,
                category: metadata.category || null,
                imageUrl: metadata.imageUrl || null,
              }),
            });
          } catch {
            // Metadata save failed, but market was created — don't block success
            console.warn("Failed to save market metadata");
          }
        }

        setStep("done");
        toast.success("Market created successfully!");
      } catch (err: unknown) {
        setStep("idle");
        const raw = err instanceof Error ? err.message : "Transaction failed";
        if (raw.includes("User rejected") || raw.includes("user rejected")) {
          toast.error("Transaction rejected");
        } else {
          toast.error(raw.length > 100 ? raw.slice(0, 100) + "..." : raw);
        }
      }
    },
    []
  );

  return {
    createMarket,
    isPending: step === "processing",
    isConfirmed: step === "done",
    error: null,
    txHash,
    marketId,
  };
}
