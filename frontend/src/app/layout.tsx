import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Header } from "@/components/layout/Header";
import { DepositModal } from "@/components/deposit/DepositModal";
import { WithdrawModal } from "@/components/deposit/WithdrawModal";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "iPred — Private Prediction Markets",
  description:
    "Privacy-preserving prediction market protocol powered by TEE and encrypted order books",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Header />
          <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-8">
            {children}
          </main>
          <DepositModal />
          <WithdrawModal />
          <Toaster theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
