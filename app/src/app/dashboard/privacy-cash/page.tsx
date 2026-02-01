"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { usePrivacyCash } from "@/contexts/PrivacyCashContext";
import { useHydrated } from "@/hooks";
import { GlassCard, Button, useWalletReady, ConnectWalletPrompt, DemoTipbox } from "@/components";
import { PRIVACY_CASH_DEMO, NETWORK } from "@/lib/constants";
import { lamportsToSol } from "@/lib/cloaked";

export default function PrivacyCashPage() {
  const hydrated = useHydrated();
  const { connected } = useWallet();
  const walletReady = useWalletReady();
  const {
    status,
    balance,
    balanceLoading,
    initialize,
    deposit,
    refreshBalance,
  } = usePrivacyCash();

  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isValidAmount = numAmount > 0;

  const handleDeposit = useCallback(async () => {
    if (!isValidAmount) return;

    setDepositing(true);
    setError(null);
    setSuccess(false);

    try {
      await deposit(numAmount);
      setSuccess(true);
      setAmount("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deposit");
    } finally {
      setDepositing(false);
    }
  }, [numAmount, isValidAmount, deposit]);

  // Loading state
  if (!hydrated || !walletReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--cloak-text-muted)]">Loading...</div>
      </div>
    );
  }

  // Not connected state
  if (!connected) {
    return (
      <ConnectWalletPrompt
        title="Connect Wallet"
        description="Connect your wallet to access Privacy Cash."
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4">
      <div className="animate-reveal w-full max-w-md">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 group"
        >
          <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-[13px] font-medium">Back to Dashboard</span>
        </Link>

        {/* Single Consolidated Vault Card */}
        <GlassCard className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--cloak-violet)]/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--cloak-violet)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-[var(--cloak-text-primary)]">Privacy Cash Vault</h1>
                <p className="text-xs text-[var(--cloak-text-muted)]">Your private funding source</p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-medium bg-[var(--cloak-warning)]/20 text-[var(--cloak-warning)] rounded-full uppercase">
              {NETWORK}
            </span>
          </div>

          {/* Simulation Notice */}
          <div className="bg-[var(--cloak-violet)]/5 border border-[var(--cloak-violet)]/20 rounded-lg p-3 mb-6">
            <div className="flex gap-2">
              <svg className="w-4 h-4 text-[var(--cloak-violet)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-[var(--cloak-text-muted)]">
                <span className="font-medium text-[var(--cloak-violet)]">Simulation Mode:</span>{" "}
                To create <span className="text-[var(--cloak-text-primary)]">Cloaked Agents</span>, deposit here first, then use the vault balance as initial funding during agent creation.{" "}
                <Link href={PRIVACY_CASH_DEMO.DOCS_URL} className="text-[var(--cloak-violet)] hover:underline">
                  Read docs
                </Link>
              </div>
            </div>
          </div>

          {/* Balance Section */}
          <div className="rounded-xl border border-zinc-800 p-5 mb-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--cloak-text-dim)] uppercase tracking-wide">Vault Balance</span>
              <button
                onClick={refreshBalance}
                disabled={balanceLoading}
                className="text-xs text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors disabled:opacity-50"
              >
                {balanceLoading ? "..." : "Refresh"}
              </button>
            </div>
            <div className="text-4xl font-bold text-[var(--cloak-violet)]">
              {status === "ready" && balance !== null
                ? `${lamportsToSol(balance).toFixed(4)}`
                : status === "idle"
                ? "—"
                : "..."}
              <span className="text-lg ml-2 opacity-60">SOL</span>
            </div>
          </div>

          {/* Deposit Section */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--cloak-text-dim)] mb-4">
              Deposit
            </h2>

            {status !== "ready" ? (
              <div>
                {status === "idle" && (
                  <>
                    <p className="text-sm text-[var(--cloak-text-muted)] mb-4">
                      Initialize to simulate the deposit flow.
                    </p>
                    <Button onClick={initialize} fullWidth>
                      Initialize Privacy Cash
                    </Button>
                  </>
                )}
                {status === "awaiting-signature" && (
                  <div className="text-center py-4">
                    <div className="w-8 h-8 border-2 border-[var(--cloak-warning)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[var(--cloak-warning)]">Sign message in wallet...</p>
                  </div>
                )}
                {status === "initializing" && (
                  <div className="text-center py-4">
                    <div className="w-8 h-8 border-2 border-[var(--cloak-violet)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[var(--cloak-text-muted)]">Initializing...</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      disabled={depositing}
                      className="input-field pr-14 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--cloak-text-muted)] font-medium text-sm">
                      SOL
                    </span>
                  </div>
                  <Button
                    onClick={handleDeposit}
                    disabled={!isValidAmount || depositing}
                    loading={depositing}
                    className="px-6"
                  >
                    {depositing ? "..." : "Deposit"}
                  </Button>
                </div>

                {/* Error */}
                {error && (
                  <div className="mt-3 p-3 bg-[var(--cloak-error)]/10 border border-[var(--cloak-error)]/30 rounded-lg">
                    <p className="text-[var(--cloak-error)] text-sm">{error}</p>
                  </div>
                )}

                {/* Success */}
                {success && (
                  <div className="mt-3 p-3 bg-[var(--cloak-success)]/10 border border-[var(--cloak-success)]/30 rounded-lg">
                    <p className="text-[var(--cloak-success)] text-sm">Deposit simulated successfully!</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--cloak-glass-border)] my-6" />

          {/* How It Works - Compact */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--cloak-text-dim)] mb-4">
              How It Works
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-[var(--cloak-violet)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[var(--cloak-violet)]">1</span>
                </div>
                <p className="text-[var(--cloak-text-muted)]">
                  <span className="text-[var(--cloak-text-primary)] font-medium">Deposit</span> SOL to your vault
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-[var(--cloak-violet)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[var(--cloak-violet)]">2</span>
                </div>
                <p className="text-[var(--cloak-text-muted)]">
                  <span className="text-[var(--cloak-text-primary)] font-medium">ZK proofs</span> break the on-chain link
                </p>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-[var(--cloak-violet)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[var(--cloak-violet)]">3</span>
                </div>
                <p className="text-[var(--cloak-text-muted)]">
                  <span className="text-[var(--cloak-text-primary)] font-medium">Fund agents</span> with no wallet connection
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--cloak-glass-border)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[var(--cloak-text-muted)]">
                <span>Withdrawal fee:</span>
                <span className="font-medium text-[var(--cloak-text-primary)]">0.35% + 0.006 SOL</span>
              </div>
              <a
                href={PRIVACY_CASH_DEMO.PRIVACY_CASH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--cloak-violet)] hover:underline flex items-center gap-1"
              >
                Learn more
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
