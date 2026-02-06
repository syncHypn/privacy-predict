'use client';

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeposit } from "@/lib/hooks/useDeposit";
import { useUSDCBalance } from "@/lib/hooks/useUSDCBalance";
import { useAppStore } from "@/store/useAppStore";
import { parseUSDC } from "@/lib/utils";
import { toast } from "sonner";

export function DepositModal() {
  const open = useAppStore((s) => s.depositModalOpen);
  const setOpen = useAppStore((s) => s.setDepositModalOpen);
  const [amount, setAmount] = useState("");
  const { user } = usePrivy();
  const { executeDeposit, step, isProcessing } = useDeposit();
  const address = user?.wallet?.address as `0x${string}` | undefined;
  const { balance } = useUSDCBalance(address);

  const isEmbedded = user?.wallet?.walletClientType === "privy";

  function handleDeposit() {
    if (!amount || parseFloat(amount) <= 0) return;

    // Pre-check balance to avoid gas estimation errors
    if (balance !== undefined) {
      const requested = parseUSDC(amount);
      if (requested > balance) {
        toast.error("Insufficient USDC balance");
        return;
      }
    }

    executeDeposit(amount, isEmbedded).catch(() => {
      // Already handled inside executeDeposit — this .catch()
      // prevents SES/Privy from flagging an unhandled rejection
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='bg-card border-border sm:max-w-[400px]'>
        <DialogHeader>
          <DialogTitle>Deposit USDC</DialogTitle>
          <DialogDescription className='text-muted-foreground'>
            Deposit USDC into your private balance to start trading.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-muted-foreground'>
              Amount (USDC)
            </label>
            <Input
              type='number'
              placeholder='100.00'
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min='0'
              step='0.01'
              disabled={isProcessing}
              className='bg-secondary border-border'
            />
          </div>

          {/* Embedded wallet: simple spinner */}
          {isProcessing && isEmbedded && (
            <div className='flex items-center justify-center gap-3 py-3'>
              <Spinner />
              <span className='text-sm text-muted-foreground'>
                Processing deposit...
              </span>
            </div>
          )}

          {/* EOA: 2-step progress */}
          {!isEmbedded && (step === 'approving' || step === 'depositing') && (
            <div className='space-y-2'>
              <StepIndicator
                label='1. Approve USDC'
                active={step === 'approving'}
                done={step === 'depositing'}
              />
              <StepIndicator
                label='2. Deposit'
                active={step === 'depositing'}
                done={false}
              />
            </div>
          )}

          <Button
            onClick={handleDeposit}
            disabled={isProcessing || !amount || parseFloat(amount) <= 0}
            className='w-full bg-primary text-primary-foreground hover:bg-primary/90'
          >
            {isProcessing
              ? 'Processing...'
              : step === 'done'
                ? 'Done!'
                : 'Deposit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className='flex items-center gap-3 text-sm'>
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
          done
            ? 'border-[var(--color-yes)] bg-[var(--color-yes)] text-white'
            : active
              ? 'border-primary text-primary'
              : 'border-muted-foreground/30 text-muted-foreground/30'
        }`}
      >
        {done ? '\u2713' : active ? <Spinner size={12} /> : ''}
      </div>
      <span
        className={
          done
            ? 'text-[var(--color-yes)]'
            : active
              ? 'text-foreground'
              : 'text-muted-foreground/50'
        }
      >
        {label}
      </span>
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      className='animate-spin text-primary'
    >
      <circle
        cx='12'
        cy='12'
        r='10'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
        className='opacity-20'
      />
      <path
        d='M12 2a10 10 0 019.17 6'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
      />
    </svg>
  );
}
