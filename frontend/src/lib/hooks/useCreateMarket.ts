"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { MarketFactoryABI } from "../contracts/abis/MarketFactory";

export function useCreateMarket() {
  const {
    writeContract,
    data: txHash,
    isPending,
    error,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  function createMarket(
    question: string,
    outcomes: string[],
    resolutionTime: bigint
  ) {
    writeContract({
      address: ADDRESSES.MarketFactory as `0x${string}`,
      abi: MarketFactoryABI,
      functionName: "createMarket",
      args: [question, outcomes, resolutionTime],
    });
  }

  return {
    createMarket,
    isPending: isPending || isConfirming,
    isConfirmed,
    error,
    txHash,
  };
}
