"use client";

import Link from "next/link";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { MarketFactoryABI } from "@/lib/contracts/abis/MarketFactory";
import { WalletButton } from "./WalletButton";

export function Header() {
  const { user } = usePrivy();
  const address = user?.wallet?.address as `0x${string}` | undefined;

  const { data: isWhitelisted } = useReadContract({
    address: ADDRESSES.MarketFactory as `0x${string}`,
    abi: MarketFactoryABI,
    functionName: "whitelisted",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: owner } = useReadContract({
    address: ADDRESSES.MarketFactory as `0x${string}`,
    abi: MarketFactoryABI,
    functionName: "owner",
  });

  const isAdmin =
    !!address &&
    (isWhitelisted === true ||
      owner?.toLowerCase() === address.toLowerCase());

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.jpg"
              alt="iPred"
              width={32}
              height={32}
              className="rounded-lg"
            />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Markets
            </Link>
            <Link
              href="/portfolio"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Portfolio
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/create"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Create
                </Link>
                <Link
                  href="/admin"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Admin
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
