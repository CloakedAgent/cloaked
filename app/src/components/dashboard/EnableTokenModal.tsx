"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui";
import { NETWORK_TOKENS, USDC_MINT_DEVNET } from "@/lib/constants";

interface EnableTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnable: (mint: PublicKey, constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
  }) => Promise<void>;
  enabledMints: string[];
  isPrivate: boolean;
}

function UsdcIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path d="M20.4 18.6c0-2-1.2-2.7-3.6-3-.8-.1-1.6-.2-2.1-.3-.8-.2-1.2-.5-1.2-1.1 0-.6.4-1 1.4-1.1 1.3-.2 2.5.1 3.4.5l.5-1.5c-1-.4-2-.6-3.1-.7v-1.6h-1.4v1.6c-1.8.2-3 1.2-3 2.8 0 1.9 1.2 2.6 3.6 2.9.7.1 1.5.2 2 .4.8.2 1.2.6 1.2 1.2 0 .8-.7 1.2-1.7 1.3-1.3.1-2.7-.3-3.8-.9l-.5 1.5c1 .6 2.3.9 3.5 1v1.7h1.4v-1.7c2-.3 3.2-1.3 3.2-3z" fill="white" />
      <path d="M12.8 24.4c-4.6-1.6-7-6.7-5.4-11.3.8-2.3 2.6-4.1 4.9-4.9l-.5-1.5C6.7 8.5 4 14.3 5.8 19.4c1 2.8 3.2 5 6 6l.5-1.5-.5.5z" fill="white" opacity="0.6" />
      <path d="M19.2 7.6c4.6 1.6 7 6.7 5.4 11.3-.8 2.3-2.6 4.1-4.9 4.9l.5 1.5c5.1-1.8 7.8-7.6 6-12.7-1-2.8-3.2-5-6-6l-.5 1.5.5-.5z" fill="white" opacity="0.6" />
    </svg>
  );
}

const AVAILABLE_TOKENS = Object.entries(NETWORK_TOKENS).map(([address, info]) => ({
  address,
  ...info,
}));

export function EnableTokenModal({
  isOpen,
  onClose,
  onEnable,
  enabledMints,
  isPrivate,
}: EnableTokenModalProps) {
  const [selectedMint, setSelectedMint] = useState<string>(USDC_MINT_DEVNET.toBase58());
  const [maxPerTx, setMaxPerTx] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setSelectedMint(USDC_MINT_DEVNET.toBase58());
    setMaxPerTx("");
    setDailyLimit("");
    setTotalLimit("");
    setEnabling(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleEnable = useCallback(async () => {
    setError(null);
    setEnabling(true);

    try {
      const mint = new PublicKey(selectedMint);
      const tokenInfo = NETWORK_TOKENS[selectedMint];
      const decimals = tokenInfo?.decimals ?? 6;
      const pow = Math.pow(10, decimals);

      await onEnable(mint, {
        maxPerTx: maxPerTx ? Math.floor(parseFloat(maxPerTx) * pow) : 0,
        dailyLimit: dailyLimit ? Math.floor(parseFloat(dailyLimit) * pow) : 0,
        totalLimit: totalLimit ? Math.floor(parseFloat(totalLimit) * pow) : 0,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable token");
      setEnabling(false);
    }
  }, [selectedMint, maxPerTx, dailyLimit, totalLimit, onEnable, handleClose]);

  if (!isOpen) return null;

  const availableTokens = AVAILABLE_TOKENS.filter((t) => !enabledMints.includes(t.address));
  const selectedTokenInfo = NETWORK_TOKENS[selectedMint];
  const accentColor = isPrivate ? "#22d3ee" : "#8b5cf6";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!enabling ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Enable Token</h2>
          <button
            onClick={handleClose}
            disabled={enabling}
            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {availableTokens.length === 0 ? (
          <>
            <p className="text-sm text-zinc-400 mb-6">All available tokens are already enabled.</p>
            <Button variant="secondary" onClick={handleClose} fullWidth>
              Close
            </Button>
          </>
        ) : (
          <>
            {/* Token selector */}
            <div className="mb-5">
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Token
              </label>
              <div className="flex gap-2">
                {availableTokens.map((t) => (
                  <button
                    key={t.address}
                    onClick={() => setSelectedMint(t.address)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      selectedMint === t.address
                        ? "border-[#2775CA]/50 bg-[#2775CA]/10"
                        : "border-[#1a1a1a] bg-[#111] hover:border-zinc-700"
                    }`}
                  >
                    <UsdcIcon size={28} />
                    <div className="text-left">
                      <div className="text-[13px] font-semibold text-white">{t.symbol}</div>
                      <div className="text-[10px] text-zinc-500">{t.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Constraints */}
            <div className="mb-6">
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3">
                Spending Constraints
              </label>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-zinc-500 mb-1 block">
                    Max per Transaction ({selectedTokenInfo?.symbol ?? "tokens"})
                  </label>
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="0.01"
                    placeholder="0 = unlimited"
                    value={maxPerTx}
                    onChange={(e) => setMaxPerTx(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 mb-1 block">
                    Daily Limit ({selectedTokenInfo?.symbol ?? "tokens"})
                  </label>
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="0.1"
                    placeholder="0 = unlimited"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 mb-1 block">
                    Total Limit ({selectedTokenInfo?.symbol ?? "tokens"})
                  </label>
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="1"
                    placeholder="0 = unlimited"
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">Leave empty or 0 for no limit</p>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#111] border border-[#1a1a1a] mb-6">
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-zinc-500">
                Enabling a token creates an on-chain account. A small amount of SOL rent will be charged (recoverable when disabled).
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                disabled={enabling}
                className="px-4 py-2.5 text-[13px] font-medium text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold transition-all disabled:opacity-50"
                style={{
                  backgroundColor: accentColor,
                  color: isPrivate ? "#000" : "#fff",
                }}
              >
                {enabling ? (
                  "Enabling..."
                ) : (
                  <>
                    <UsdcIcon size={18} />
                    Enable {selectedTokenInfo?.symbol ?? "Token"}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
