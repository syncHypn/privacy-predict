"use client";

import { writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "../wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { PrivateTokenABI } from "../contracts/abis/PrivateToken";
import { encryptWithdrawal, generateKeyPair } from "../encryption";
import { parseUSDC } from "../utils";
import { useTEEPublicKey } from "./useTEEPublicKey";
import { useState, useCallback } from "react";
import { toast } from "sonner";

type Step = "idle" | "processing" | "done";

export function useWithdraw() {
  const [step, setStep] = useState<Step>("idle");
  const { teePublicKey, isLoading: isTEEKeyLoading, error: teeKeyError } = useTEEPublicKey();

  const executeWithdraw = useCallback(
    async (amount: string) => {
      if (!teePublicKey) {
        toast.error(teeKeyError?.message || "TEE public key not available");
        return;
      }

      setStep("processing");

      try {
        const keyPair = generateKeyPair();

        const { encryptedAmount, commitmentHash } = encryptWithdrawal(
          parseUSDC(amount).toString(),
          teePublicKey,
          keyPair.secretKey
        );

        const txHash = await writeContract(wagmiConfig, {
          address: ADDRESSES.PrivateToken as `0x${string}`,
          abi: PrivateTokenABI,
          functionName: "requestWithdrawal",
          args: [commitmentHash, encryptedAmount],
        });

        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: txHash,
        });

        if (receipt.status === "reverted") {
          throw new Error("Withdrawal request reverted");
        }

        setStep("done");
        toast.success("Withdrawal request submitted — pending TEE processing");
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

  const reset = useCallback(() => setStep("idle"), []);

  return {
    executeWithdraw,
    step,
    isProcessing,
    isTEEKeyLoading,
    teeKeyError,
    reset,
  };
}
