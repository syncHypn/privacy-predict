"use client";

import { useReadContract } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { PredictionMarketABI } from "../contracts/abis/PredictionMarket";
import { hexToBytes } from "../encryption";

export function useTEEPublicKey(): {
  teePublicKey: Uint8Array | null;
  isLoading: boolean;
  error: Error | null;
} {
  const predictionMarketAddress = ADDRESSES.PredictionMarket;
  const enabled = !!predictionMarketAddress;

  const { data, isLoading, error } = useReadContract({
    address: predictionMarketAddress as `0x${string}`,
    abi: PredictionMarketABI,
    functionName: "getTEEPublicKey",
    query: { enabled },
  });

  if (!enabled) {
    return { teePublicKey: null, isLoading: false, error: new Error("PredictionMarket address not configured — set NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS") };
  }

  if (!data || isLoading) {
    return { teePublicKey: null, isLoading, error: error as Error | null };
  }

  const teePublicKey = hexToBytes(data as string);
  return { teePublicKey, isLoading: false, error: null };
}
