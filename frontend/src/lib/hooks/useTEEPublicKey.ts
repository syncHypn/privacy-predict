"use client";

import { useReadContract } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { PredictionMarketABI } from "../contracts/abis/PredictionMarket";
import { hexToBytes } from "../encryption";

// Fallback TEE public key from env (used when PredictionMarket is not yet deployed)
const FALLBACK_TEE_KEY = process.env.NEXT_PUBLIC_TEE_PUBLIC_KEY || "";

export function useTEEPublicKey(): {
  teePublicKey: Uint8Array | null;
  isLoading: boolean;
  error: Error | null;
} {
  const predictionMarketAddress = ADDRESSES.PredictionMarket;
  const useContract = !!predictionMarketAddress;

  const { data, isLoading, error } = useReadContract({
    address: predictionMarketAddress as `0x${string}`,
    abi: PredictionMarketABI,
    functionName: "getTEEPublicKey",
    query: { enabled: useContract },
  });

  // If PredictionMarket is deployed, read from contract
  if (useContract) {
    if (!data || isLoading) {
      return { teePublicKey: null, isLoading, error: error as Error | null };
    }
    const teePublicKey = hexToBytes(data as string);
    return { teePublicKey, isLoading: false, error: null };
  }

  // Fallback to env variable
  if (FALLBACK_TEE_KEY) {
    const teePublicKey = hexToBytes(FALLBACK_TEE_KEY);
    return { teePublicKey, isLoading: false, error: null };
  }

  return {
    teePublicKey: null,
    isLoading: false,
    error: new Error("TEE public key not configured — set NEXT_PUBLIC_TEE_PUBLIC_KEY or NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS"),
  };
}
