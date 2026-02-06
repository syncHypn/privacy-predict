"use client";

import { useReadContract } from "wagmi";
import { ADDRESSES } from "../contracts/addresses";
import { ERC20ABI } from "../contracts/abis/ERC20";

export function useUSDCBalance(address: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: ADDRESSES.MockUSDC as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return {
    balance: data as bigint | undefined,
    isLoading,
    error,
  };
}
