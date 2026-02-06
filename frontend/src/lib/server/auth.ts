import { PrivyClient } from "@privy-io/server-auth";
import { createPublicClient, http, getAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { MarketFactoryABI } from "../contracts/abis/MarketFactory";
import { ADDRESSES } from "../contracts/addresses";

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(
    process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc"
  ),
});

/**
 * Verify the Privy access token and return the user's wallet address.
 * Returns null if the token is invalid or the user has no wallet.
 */
export async function getAuthenticatedAddress(
  authHeader: string | null
): Promise<`0x${string}` | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { userId } = await privy.verifyAuthToken(token);
    const user = await privy.getUser(userId);

    const wallet =
      user.linkedAccounts.find(
        (a) => a.type === "wallet" && a.chainType === "ethereum"
      ) ??
      user.linkedAccounts.find((a) => a.type === "wallet");

    if (!wallet || !("address" in wallet)) return null;
    return getAddress(wallet.address) as `0x${string}`;
  } catch {
    return null;
  }
}

/**
 * Check if an address is an admin (whitelisted or owner) on the MarketFactory contract.
 */
export async function isAdmin(address: `0x${string}`): Promise<boolean> {
  const factoryAddress = ADDRESSES.MarketFactory as `0x${string}`;

  const [isWhitelisted, owner] = await Promise.all([
    publicClient.readContract({
      address: factoryAddress,
      abi: MarketFactoryABI,
      functionName: "whitelisted",
      args: [address],
    }),
    publicClient.readContract({
      address: factoryAddress,
      abi: MarketFactoryABI,
      functionName: "owner",
    }),
  ]);

  return (
    isWhitelisted === true ||
    (owner as string).toLowerCase() === address.toLowerCase()
  );
}

/**
 * Verify the request is from an authenticated admin.
 * Returns the admin's address or null.
 */
export async function verifyAdmin(
  authHeader: string | null
): Promise<`0x${string}` | null> {
  const address = await getAuthenticatedAddress(authHeader);
  if (!address) return null;

  const admin = await isAdmin(address);
  return admin ? address : null;
}
