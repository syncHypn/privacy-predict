"use client";

import { writeContract, waitForTransactionReceipt, switchChain } from "wagmi/actions";
import { pad, isHex } from "viem";
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
import { getGasOverrides } from "../gas";
import { useTEEPublicKey } from "./useTEEPublicKey";
import { useState, useCallback } from "react";
import { toast } from "sonner";

/** Ensure a hex string is a valid bytes32 (left-padded to 32 bytes) */
function toBytes32(value: string): `0x${string}` {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!isHex(hex)) throw new Error(`Invalid hex value: ${value}`);
  return pad(hex as `0x${string}`, { size: 32 });
}

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

        const normalizedMarketId = toBytes32(marketId);

        const gas = await getGasOverrides();
        const txHash = await writeContract(wagmiConfig, {
          chainId: arbitrumSepolia.id,
          address: ADDRESSES.OrderQueue as `0x${string}`,
          abi: OrderQueueABI,
          functionName: "submitOrder",
          args: [normalizedMarketId, encryptedBytes],
          ...gas,
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
