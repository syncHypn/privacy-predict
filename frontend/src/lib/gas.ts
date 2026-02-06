import { getGasPrice } from "wagmi/actions";
import { wagmiConfig } from "./wagmi";
import { arbitrumSepolia } from "wagmi/chains";

/**
 * Fetch current gas price for Arbitrum Sepolia with a 50% buffer
 * to avoid "max fee per gas less than block base fee" errors.
 */
export async function getGasOverrides() {
  const gasPrice = await getGasPrice(wagmiConfig, {
    chainId: arbitrumSepolia.id,
  });
  // 50% buffer on top of current gas price
  const buffered = (gasPrice * 150n) / 100n;
  return { maxFeePerGas: buffered, maxPriorityFeePerGas: buffered };
}
