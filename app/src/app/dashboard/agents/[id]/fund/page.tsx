"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useAgentToken, useSigner, useHydrated } from "@/hooks";
import { CloakedAgent, CLOAKED_PROGRAM_ID } from "@cloakedagent/sdk";
import { usePrivacyCash } from "@/contexts/PrivacyCashContext";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { GlassCard, Button, Input, Skeleton, useWalletReady, ConnectWalletPrompt, DemoTipbox } from "@/components";
import { formatSol } from "@/lib/cloaked";
import { NETWORK, PRIVACY_CASH_DEMO } from "@/lib/constants";

type FundMode = "wallet" | "private";
type FundStatus = "idle" | "funding" | "success" | "error";

export default function AgentFundPage() {
  const hydrated = useHydrated();
  const params = useParams();
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const walletReady = useWalletReady();
  const { connection } = useConnection();
  const signer = useSigner();
  const delegateId = params.id as string;
  const { token: agent, loading, error: agentError, refresh } = useAgentToken(delegateId);
  const { getName } = useAgentNames();

  const {
    status: pcStatus,
    balance: pcBalance,
    walletBalance,
    balanceLoading,
    initialize,
    withdraw,
    fundTokenPda,
    refreshBalance: refreshPcBalance,
  } = usePrivacyCash();

  const [fundMode, setFundMode] = useState<FundMode>("wallet");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<FundStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Derive vault address
  const vaultAddress = useMemo(() => {
    if (!delegateId) return null;
    try {
      const delegatePubkey = new PublicKey(delegateId);
      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegatePubkey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
      return vaultPda;
    } catch {
      return null;
    }
  }, [delegateId]);

  // Get display name from context
  const displayName = useMemo(() => {
    if (!vaultAddress) return `Agent ${delegateId.slice(0, 4)}...`;
    return getName(vaultAddress.toBase58()) || `Agent ${delegateId.slice(0, 4)}...`;
  }, [vaultAddress, delegateId, getName]);

  // Initialize PrivacyCash when needed
  useEffect(() => {
    if (connected && pcStatus === "idle" && fundMode === "private") {
      initialize();
    }
  }, [connected, pcStatus, fundMode, initialize]);

  const effectiveBalance = fundMode === "wallet" ? walletBalance : pcBalance;
  const balanceSol = effectiveBalance !== null ? effectiveBalance / 1e9 : 0;
  const numAmount = parseFloat(amount) || 0;
  const isValidAmount = numAmount > 0 && numAmount <= balanceSol;

  const handleFund = useCallback(async () => {
    if (!vaultAddress || !signer) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setStatus("funding");
    setError(null);

    try {
      let signature: string;

      if (fundMode === "wallet") {
        // Direct wallet transfer using SDK
        const token = CloakedAgent.forOwner(delegateId, connection.rpcEndpoint);
        const lamports = Math.floor(numAmount * 1e9);
        signature = await token.deposit(signer, lamports);
      } else {
        // Private transfer via PrivacyCash
        const result = await withdraw(numAmount, vaultAddress);
        signature = result.tx;
      }

      setTxSignature(signature);
      setStatus("success");
      refresh();
      refreshPcBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fund agent");
      setStatus("error");
    }
  }, [vaultAddress, signer, amount, fundMode, delegateId, connection.rpcEndpoint, withdraw, refresh, refreshPcBalance]);

  const [copied, setCopied] = useState(false);
  const handleCopyVault = useCallback(() => {
    if (vaultAddress) {
      navigator.clipboard.writeText(vaultAddress.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [vaultAddress]);

  // Show loading while hydrating or wallet is initializing (autoConnect in progress)
  if (!hydrated || !walletReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--cloak-text-muted)]">Loading...</div>
      </div>
    );
  }

  // Show connect prompt if not connected
  if (!connected) {
    return (
      <ConnectWalletPrompt
        title="Connect Wallet"
        description="Connect your wallet to fund this agent."
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Skeleton className="w-32 h-4 mb-6" />
          <GlassCard>
            <Skeleton className="w-full h-48" />
          </GlassCard>
        </div>
      </div>
    );
  }

  if (agentError || !agent) {
    return (
      <div className="min-h-screen relative z-10">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <GlassCard className="text-center py-12">
            <h2 className="text-xl font-bold mb-2">Agent Not Found</h2>
            <p className="text-[var(--cloak-text-muted)] mb-6">{agentError || "This agent doesn't exist."}</p>
            <Link href="/dashboard">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
          </GlassCard>
        </div>
      </div>
    );
  }

  // Success view
  if (status === "success") {
    return (
      <div className="min-h-screen relative z-10">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <GlassCard className="animate-reveal">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[var(--cloak-success)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[var(--cloak-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2 text-[var(--cloak-success)]">Agent Funded!</h1>
              <p className="text-[var(--cloak-text-muted)]">
                {numAmount.toFixed(4)} SOL has been added to {displayName}
              </p>
            </div>

            {txSignature && !txSignature.startsWith("sim_") && (
              <div className="mb-6 text-center">
                <a
                  href={`https://solscan.io/tx/${txSignature}?cluster=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--cloak-violet)] hover:text-[var(--cloak-violet-dim)] text-sm transition-colors"
                >
                  View transaction on Explorer →
                </a>
              </div>
            )}

            <div className="flex gap-4">
              <Link href={`/dashboard/agents/${delegateId}`} className="flex-1">
                <Button variant="primary" fullWidth>
                  Back to Agent
                </Button>
              </Link>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setStatus("idle");
                  setAmount("");
                  setTxSignature(null);
                }}
                className="flex-1"
              >
                Add More
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Back Link */}
        <Link
          href={`/dashboard/agents/${delegateId}`}
          className="inline-flex items-center gap-2 text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {displayName}
        </Link>

        <h1 className="text-3xl font-bold mb-2 animate-reveal">Fund Agent</h1>
        <p className="text-[var(--cloak-text-muted)] mb-8 animate-reveal">
          Add SOL to {displayName}&apos;s balance
        </p>

        {/* Current Balance */}
        <GlassCard className="mb-6 animate-reveal">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-[var(--cloak-text-muted)] mb-1">Current Agent Balance</div>
              <div className="balance-display text-3xl">
                {formatSol(agent.balance)} <span className="text-xl opacity-60">SOL</span>
              </div>
            </div>
            <button onClick={refresh} className="text-sm text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors">
              Refresh
            </button>
          </div>
        </GlassCard>

        {/* Fund Mode Toggle */}
        <GlassCard className="mb-6 animate-reveal animate-reveal-delay-1">
          <div className="flex gap-2 mb-6 p-1 bg-[var(--cloak-surface)] rounded-lg">
            <button
              onClick={() => setFundMode("wallet")}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                fundMode === "wallet"
                  ? "bg-[var(--cloak-violet)] text-white"
                  : "text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)]"
              }`}
            >
              💳 Direct (Wallet)
            </button>
            <button
              onClick={() => setFundMode("private")}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                fundMode === "private"
                  ? "bg-[var(--cloak-violet)] text-white"
                  : "text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)]"
              }`}
            >
              🔒 Private (Shielded)
            </button>
          </div>

          {/* Mode Description */}
          <div className="mb-6">
            {fundMode === "wallet" ? (
              <div className="p-3 bg-[var(--cloak-surface)] rounded-lg">
                <p className="text-sm text-[var(--cloak-text-muted)]">
                  <span className="text-[var(--cloak-warning)]">⚠️</span> Direct transfer from your wallet.
                  The funding transaction will be visible on-chain linking your wallet to this agent.
                </p>
              </div>
            ) : (
              <>
                <DemoTipbox className="mb-3" compact />
                <div className="p-3 bg-[var(--cloak-surface)] rounded-lg">
                  <p className="text-sm text-[var(--cloak-text-muted)]">
                    <span className="text-[var(--cloak-success)]">✓</span> Private transfer via Privacy Cash.
                    No on-chain link between your wallet and this agent&apos;s funding.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Balance Display */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[var(--cloak-text-muted)]">
              {fundMode === "wallet" ? "Wallet Balance" : "Privacy Cash Balance"}
            </span>
            <button
              onClick={refreshPcBalance}
              disabled={balanceLoading}
              className="text-sm text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors disabled:opacity-50"
            >
              {balanceLoading ? "..." : "Refresh"}
            </button>
          </div>

          {fundMode === "private" && pcStatus !== "ready" ? (
            <div className="mb-6">
              {pcStatus === "idle" && (
                <button onClick={initialize} className="text-[var(--cloak-violet)] hover:text-[var(--cloak-violet-dim)] transition-colors">
                  Initialize Privacy Cash →
                </button>
              )}
              {pcStatus === "awaiting-signature" && (
                <p className="text-[var(--cloak-warning)]">Sign message in wallet...</p>
              )}
              {pcStatus === "initializing" && (
                <p className="text-[var(--cloak-text-muted)] animate-pulse">Initializing...</p>
              )}
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-[var(--cloak-violet)] mb-6">
                {balanceLoading ? "..." : `${balanceSol.toFixed(4)} SOL`}
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-sm text-[var(--cloak-text-muted)] mb-2">Amount to add</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    max={balanceSol}
                    disabled={status === "funding"}
                    className="input-field pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setAmount(balanceSol.toString())}
                    disabled={status === "funding"}
                    className="absolute right-12 top-1/2 -translate-y-1/2 text-[var(--cloak-violet)] hover:text-[var(--cloak-violet-dim)] text-sm disabled:opacity-50 transition-colors"
                  >
                    MAX
                  </button>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--cloak-text-muted)]">SOL</span>
                </div>
                {numAmount > balanceSol && (
                  <p className="text-[var(--cloak-error)] text-sm mt-1">Exceeds available balance</p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-[var(--cloak-error)]/10 border border-[var(--cloak-error)]/30 rounded-lg">
                  <p className="text-[var(--cloak-error)] text-sm">{error}</p>
                </div>
              )}

              {/* Fund Button */}
              <Button
                onClick={handleFund}
                disabled={!isValidAmount || status === "funding"}
                loading={status === "funding"}
                fullWidth
              >
                {status === "funding" ? "Funding..." : `Add ${numAmount > 0 ? numAmount.toFixed(4) : "0"} SOL`}
              </Button>
            </>
          )}
        </GlassCard>

        {/* Manual Transfer Option */}
        <GlassCard className="animate-reveal animate-reveal-delay-2">
          <h3 className="font-semibold mb-3">Alternative: Direct Transfer</h3>
          <p className="text-sm text-[var(--cloak-text-muted)] mb-4">
            Send SOL directly to the vault address from anywhere - exchanges, other wallets, or{" "}
            <a
              href={PRIVACY_CASH_DEMO.PRIVACY_CASH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--cloak-violet)] hover:underline"
            >
              Privacy Cash directly
            </a>
            .
          </p>

          {vaultAddress && (
            <div className="bg-[var(--cloak-surface)] rounded-lg p-4">
              <div className="text-xs text-[var(--cloak-text-muted)] mb-2">Vault Address</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-[var(--cloak-cyan)] break-all">
                  {vaultAddress.toBase58()}
                </code>
                <button
                  onClick={handleCopyVault}
                  className="text-[var(--cloak-text-muted)] hover:text-[var(--cloak-cyan)] transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-[var(--cloak-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--cloak-text-dim)] mt-4">
            ⚠️ Only send SOL to this address. Other tokens will be lost.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
