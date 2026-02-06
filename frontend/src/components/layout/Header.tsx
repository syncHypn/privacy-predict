"use client";

import Link from "next/link";
import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">iP</span>
            </div>
            <span className="text-lg font-bold text-foreground">iPred</span>
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
            <Link
              href="/create"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Create
            </Link>
          </nav>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
