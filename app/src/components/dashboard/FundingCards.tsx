"use client";

import { useState, useCallback, useMemo } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useSigner } from "@/hooks";
import { CloakedAgent, CLOAKED_PROGRAM_ID } from "@cloakedagent/sdk";
import { usePrivacyCash } from "@/contexts/PrivacyCashContext";
import { NETWORK } from "@/lib/constants";

interface FundingCardsProps {
  delegateId: string;
  isPrivate?: boolean;
  onFundSuccess?: () => void;
}

export function FundingCards({ delegateId, isPrivate, onFundSuccess }: FundingCardsProps) {
  const { connection } = useConnection();
  const signer = useSigner();

  const {
    status: pcStatus,
    balance: pcBalance,
    walletBalance,
    balanceLoading,
    initialize,
    withdraw,
    refreshBalance: refreshPcBalance,
  } = usePrivacyCash();

  // Standard funding state
  const [standardAmount, setStandardAmount] = useState("");
  const [standardLoading, setStandardLoading] = useState(false);
  const [standardError, setStandardError] = useState<string | null>(null);
  const [standardSuccess, setStandardSuccess] = useState<string | null>(null);

  // Privacy Cash funding state
  const [privateAmount, setPrivateAmount] = useState("");
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateSuccess, setPrivateSuccess] = useState<string | null>(null);

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

  const walletBalanceSol = walletBalance !== null ? walletBalance / 1e9 : 0;
  const pcBalanceSol = pcBalance !== null ? pcBalance / 1e9 : 0;

  // Standard funding handler
  const handleStandardFund = useCallback(async () => {
    if (!vaultAddress || !signer) return;

    const numAmount = parseFloat(standardAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setStandardError("Enter a valid amount");
      return;
    }

    setStandardLoading(true);
    setStandardError(null);
    setStandardSuccess(null);

    try {
      const token = CloakedAgent.forOwner(delegateId, connection.rpcEndpoint);
      const lamports = Math.floor(numAmount * 1e9);
      const signature = await token.deposit(signer, lamports);

      setStandardSuccess(signature);
      setStandardAmount("");
      onFundSuccess?.();
    } catch (err) {
      setStandardError(err instanceof Error ? err.message : "Failed to fund agent");
    } finally {
      setStandardLoading(false);
    }
  }, [vaultAddress, signer, standardAmount, delegateId, connection.rpcEndpoint, onFundSuccess]);

  // Privacy Cash funding handler
  const handlePrivateFund = useCallback(async () => {
    if (!vaultAddress) return;

    const numAmount = parseFloat(privateAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setPrivateError("Enter a valid amount");
      return;
    }

    setPrivateLoading(true);
    setPrivateError(null);
    setPrivateSuccess(null);

    try {
      const result = await withdraw(numAmount, vaultAddress);
      setPrivateSuccess(result.tx);
      setPrivateAmount("");
      onFundSuccess?.();
      refreshPcBalance();
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : "Failed to fund agent");
    } finally {
      setPrivateLoading(false);
    }
  }, [vaultAddress, privateAmount, withdraw, onFundSuccess, refreshPcBalance]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Standard Funding Card */}
      <div className="glass-card rounded-[8px] p-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <svg className="w-[60px] h-[60px] text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>

        <h3 className="text-[13px] font-semibold text-white mb-1">Standard Funding</h3>
        <p className="text-[11px] text-zinc-500 mb-4">Direct transfer from connected wallet</p>

        {standardSuccess ? (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-[var(--cloak-success)] mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[12px] font-medium">Funded successfully!</span>
            </div>
            {!standardSuccess.startsWith("sim_") && (
              <a
                href={`https://solscan.io/tx/${standardSuccess}?cluster=${NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#8b5cf6] hover:text-[#a78bfa] flex items-center gap-1"
              >
                View on Explorer
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            <button
              onClick={() => setStandardSuccess(null)}
              className="text-[10px] text-zinc-500 hover:text-white mt-2 block"
            >
              Add more funds
            </button>
          </div>
        ) : (
          <>
            <div className="flex space-x-3 mb-4">
              <div className="relative flex-1">
                <input
                  className="glass-input w-full rounded px-3 py-2 pr-12 text-[13px] font-mono"
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  min="0"
                  value={standardAmount}
                  onChange={(e) => setStandardAmount(e.target.value)}
                  disabled={standardLoading}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">SOL</span>
              </div>
              <button
                onClick={handleStandardFund}
                disabled={standardLoading || !standardAmount || parseFloat(standardAmount) <= 0}
                className="px-4 py-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[12px] font-bold rounded transition-colors shadow-[0_0_10px_rgba(139,92,246,0.2)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {standardLoading ? "..." : "Add Funds"}
              </button>
            </div>

            {standardError && (
              <p className="text-[10px] text-[var(--cloak-error)] mb-2">{standardError}</p>
            )}
          </>
        )}

        <div className="flex items-center text-[10px] text-zinc-500 space-x-2">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
          </svg>
          <span>Wallet Balance: {balanceLoading ? "..." : `${walletBalanceSol.toFixed(4)} SOL`}</span>
        </div>
      </div>

      {/* Privacy Cash Funding Card */}
      <div className="glass-card rounded-[8px] p-6 relative overflow-hidden group border-cyan-900/30">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <svg className="w-[60px] h-[60px] text-[#22d3ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <div className="flex items-center space-x-2 mb-1">
          <h3 className="text-[13px] font-semibold text-white">Privacy Cash Funding</h3>
          <span className="text-[9px] bg-[#22d3ee]/10 text-[#22d3ee] px-1.5 py-0.5 rounded border border-[#22d3ee]/20 font-bold uppercase">
            Shielded
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 mb-4">Anonymous funding via Privacy Cash</p>

        {pcStatus !== "ready" ? (
          <div className="mb-4">
            {pcStatus === "idle" && (
              <button
                onClick={initialize}
                className="text-[12px] text-[#22d3ee] hover:text-[#06b6d4] transition-colors flex items-center gap-1"
              >
                Initialize Privacy Cash
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {pcStatus === "awaiting-signature" && (
              <p className="text-[12px] text-[var(--cloak-warning)]">Sign message in wallet...</p>
            )}
            {pcStatus === "initializing" && (
              <p className="text-[12px] text-zinc-500 animate-pulse">Initializing...</p>
            )}
          </div>
        ) : privateSuccess ? (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-[var(--cloak-success)] mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[12px] font-medium">Funded privately!</span>
            </div>
            {!privateSuccess.startsWith("sim_") && (
              <a
                href={`https://solscan.io/tx/${privateSuccess}?cluster=${NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#22d3ee] hover:text-[#06b6d4] flex items-center gap-1"
              >
                View on Explorer
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            <button
              onClick={() => setPrivateSuccess(null)}
              className="text-[10px] text-zinc-500 hover:text-white mt-2 block"
            >
              Add more funds
            </button>
          </div>
        ) : (
          <>
            <div className="flex space-x-3 mb-4">
              <div className="relative flex-1">
                <input
                  className="glass-input w-full rounded px-3 py-2 pr-12 text-[13px] font-mono"
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  min="0"
                  value={privateAmount}
                  onChange={(e) => setPrivateAmount(e.target.value)}
                  disabled={privateLoading}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">SOL</span>
              </div>
              <button
                onClick={handlePrivateFund}
                disabled={privateLoading || !privateAmount || parseFloat(privateAmount) <= 0}
                className="px-4 py-2 bg-[#22d3ee] hover:bg-[#06b6d4] text-black text-[12px] font-bold rounded transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {privateLoading ? "..." : "Shield & Fund"}
              </button>
            </div>

            {privateError && (
              <p className="text-[10px] text-[var(--cloak-error)] mb-2">{privateError}</p>
            )}
          </>
        )}

        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center space-x-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Privacy Cash: {balanceLoading ? "..." : `${pcBalanceSol.toFixed(4)} SOL`}</span>
          </div>
          <Link
            href="/dashboard/privacy-cash"
            className="text-[#22d3ee] hover:text-[#06b6d4] flex items-center gap-1 transition-colors"
          >
            Top up
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
