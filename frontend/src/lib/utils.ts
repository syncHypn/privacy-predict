import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { USDC_DECIMALS, PRICE_SCALE } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return `${Math.round((price / PRICE_SCALE) * 100)}%`;
}

export function formatUSDC(amount: bigint): string {
  const whole = amount / BigInt(10 ** USDC_DECIMALS);
  const frac = amount % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}

export function parseUSDC(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeUntil(timestamp: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (timestamp <= now) return "Expired";

  const diff = Number(timestamp - now);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
