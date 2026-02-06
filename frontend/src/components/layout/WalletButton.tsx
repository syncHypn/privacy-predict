"use client";

import { useRef, useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/useAppStore";
import { shortenAddress } from "@/lib/utils";

export function WalletButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const setDepositModalOpen = useAppStore((s) => s.setDepositModalOpen);
  const setWithdrawModalOpen = useAppStore((s) => s.setWithdrawModalOpen);

  const address = user?.wallet?.address;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  if (!ready) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-secondary" />
    );
  }

  if (!authenticated) {
    return (
      <Button
        size="sm"
        onClick={login}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Connect
      </Button>
    );
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Avatar */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 ring-2 ring-transparent transition-all hover:ring-primary/50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className="text-primary"
          >
            <circle cx="12" cy="8" r="4" fill="currentColor" />
            <path
              d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/20">
            {/* Address — click to copy */}
            {address && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-secondary"
              >
                <span className="text-sm font-mono text-muted-foreground">
                  {shortenAddress(address)}
                </span>
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--color-yes)]">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                )}
              </button>
            )}
            <Separator className="bg-border" />

            {/* Deposit */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setDepositModalOpen(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Deposit
            </button>

            {/* Withdraw */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setWithdrawModalOpen(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 20V4m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Withdraw
            </button>

            <Separator className="bg-border" />

            {/* Disconnect */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setShowLogout(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 transition-colors hover:bg-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-400">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Disconnect confirmation */}
      <Dialog open={showLogout} onOpenChange={setShowLogout}>
        <DialogContent className="bg-card border-border sm:max-w-[360px] sm:rounded-2xl p-6">
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-lg">Disconnect</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Are you sure you want to disconnect?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                logout();
                setShowLogout(false);
              }}
            >
              Disconnect
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowLogout(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
