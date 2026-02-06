"use client";

import { writeContract, waitForTransactionReceipt, switchChain } from "wagmi/actions";
import { arbitrumSepolia } from "wagmi/chains";
import { wagmiConfig } from "../wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { OrderQueueABI } from "../contracts/abis/OrderQueue";
import {
  encryptOrder,
  encryptedOrderToBytes,
  generateKeyPair,
  type OrderPayload,
} from "../encryption";
import { useTEEPublicKey } from "./useTEEPublicKey";
import { useState, useCallback } from "react";
import { toast } from "sonner";

type Step = "idle" | "processing" | "done";

export function useSubmitOrder() {
  const [step, setStep] = useState<Step>("idle");
  const { teePublicKey, isLoading: isTEEKeyLoading, error: teeKeyError } = useTEEPublicKey();

  const submitOrder = useCallback(
    async (
      marketId: `0x${string}`,
      side: "BUY" | "SELL",
      outcomeIndex: number,
      amount: string
    ) => {
      if (!teePublicKey) {
        toast.error(teeKeyError?.message || "TEE public key not available");
        return;
      }

      setStep("processing");

      try {
        await switchChain(wagmiConfig, { chainId: arbitrumSepolia.id });
        const keyPair = generateKeyPair();

        const orderPayload: OrderPayload = {
          side,
          outcomeIndex,
          amount,
          nonce: Math.floor(Math.random() * 1_000_000),
          timestamp: Math.floor(Date.now() / 1000),
        };

        const encrypted = encryptOrder(orderPayload, teePublicKey, keyPair.secretKey);
        const encryptedBytes = encryptedOrderToBytes(encrypted);

        const txHash = await writeContract(wagmiConfig, {
          chainId: arbitrumSepolia.id,
          address: ADDRESSES.OrderQueue as `0x${string}`,
          abi: OrderQueueABI,
          functionName: "submitOrder",
          args: [marketId, encryptedBytes],
        });

        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: txHash,
        });

        if (receipt.status === "reverted") {
          throw new Error("Order submission reverted");
        }

        setStep("done");
        toast.success("Order submitted successfully");
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
    [teePublicKey, teeKeyError]
  );

  const isProcessing = step === "processing";

  return {
    submitOrder,
    step,
    isProcessing,
    isTEEKeyLoading,
    teeKeyError,
  };
}
