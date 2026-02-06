"use client";

import { writeContract, waitForTransactionReceipt, switchChain } from "wagmi/actions";
import { arbitrumSepolia } from "wagmi/chains";
import { wagmiConfig } from "../wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { ERC20ABI } from "../contracts/abis/ERC20";
import { PrivateTokenABI } from "../contracts/abis/PrivateToken";
import { getGasOverrides } from "../gas";
import { parseUSDC } from "../utils";
import { useState, useCallback } from "react";
import { toast } from "sonner";

type Step = "idle" | "processing" | "approving" | "depositing" | "done";

export function useDeposit() {
  const [step, setStep] = useState<Step>("idle");

  const executeDeposit = useCallback(
    async (amount: string, isEmbeddedWallet: boolean) => {
      const amountBigInt = parseUSDC(amount);

      setStep(isEmbeddedWallet ? "processing" : "approving");

      try {
        await switchChain(wagmiConfig, { chainId: arbitrumSepolia.id });
        const gas = await getGasOverrides();

        const approveHash = await writeContract(wagmiConfig, {
          chainId: arbitrumSepolia.id,
          address: ADDRESSES.MockUSDC as `0x${string}`,
          abi: ERC20ABI,
          functionName: "approve",
          args: [ADDRESSES.PrivateToken as `0x${string}`, amountBigInt],
          ...gas,
        });

        const approveReceipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: approveHash,
        });

        if (approveReceipt.status === "reverted") {
          throw new Error("Approval transaction reverted");
        }

        if (!isEmbeddedWallet) {
          setStep("depositing");
        }

        const gas2 = await getGasOverrides();
        const depositHash = await writeContract(wagmiConfig, {
          chainId: arbitrumSepolia.id,
          address: ADDRESSES.PrivateToken as `0x${string}`,
          abi: PrivateTokenABI,
          functionName: "deposit",
          args: [amountBigInt],
          ...gas2,
        });

        const depositReceipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: depositHash,
        });

        if (depositReceipt.status === "reverted") {
          throw new Error("Deposit transaction reverted — check your USDC balance");
        }

        setStep("done");
        toast.success("Deposit successful!");
      } catch (err: unknown) {
        setStep("idle");
        const raw = err instanceof Error ? err.message : "Transaction failed";
        if (raw.includes("User rejected") || raw.includes("user rejected")) {
          toast.error("Transaction rejected");
        } else if (raw.includes("exceeds balance") || raw.includes("insufficient")) {
          toast.error("Insufficient USDC balance");
        } else {
          toast.error(raw.length > 100 ? raw.slice(0, 100) + "..." : raw);
        }
      }
    },
    []
  );

  const isProcessing =
    step === "processing" || step === "approving" || step === "depositing";

  const reset = useCallback(() => setStep("idle"), []);

  return {
    executeDeposit,
    step,
    isProcessing,
    reset,
  };
}
