"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { TokenVaultInfo } from "@/hooks";
import { formatToken } from "@/lib/cloaked";

interface TokenSectionProps {
  tokens: TokenVaultInfo[];
  loading: boolean;
  isOwner: boolean;
  isPrivate: boolean;
  onEnableToken: () => void;
  onDisableToken: (mint: PublicKey) => Promise<void>;
  onUpdateConstraints: (mint: PublicKey, constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
  }) => Promise<void>;
}

export function TokenSection({
  tokens,
  loading,
  isOwner,
  isPrivate,
  onEnableToken,
  onDisableToken,
  onUpdateConstraints,
}: TokenSectionProps) {
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [editingMint, setEditingMint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState<string | null>(null);

  // Edit state
  const [maxPerTx, setMaxPerTx] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [totalLimit, setTotalLimit] = useState("");

  const selectedToken = tokens.find((t) =>
    t.mint.toBase58() === (selectedMint ?? tokens[0]?.mint.toBase58())
  ) ?? tokens[0] ?? null;

  const handleStartEdit = useCallback((token: TokenVaultInfo) => {
    const d = token.decimals;
    const pow = Math.pow(10, d);
    setMaxPerTx(token.constraints.maxPerTx > 0 ? (token.constraints.maxPerTx / pow).toString() : "");
    setDailyLimit(token.constraints.dailyLimit > 0 ? (token.constraints.dailyLimit / pow).toString() : "");
    setTotalLimit(token.constraints.totalLimit > 0 ? (token.constraints.totalLimit / pow).toString() : "");
    setEditingMint(token.mint.toBase58());
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedToken) return;
    setSaving(true);
    try {
      const pow = Math.pow(10, selectedToken.decimals);
      await onUpdateConstraints(selectedToken.mint, {
        maxPerTx: maxPerTx ? Math.floor(parseFloat(maxPerTx) * pow) : 0,
        dailyLimit: dailyLimit ? Math.floor(parseFloat(dailyLimit) * pow) : 0,
        totalLimit: totalLimit ? Math.floor(parseFloat(totalLimit) * pow) : 0,
      });
      setEditingMint(null);
    } finally {
      setSaving(false);
    }
  }, [selectedToken, maxPerTx, dailyLimit, totalLimit, onUpdateConstraints]);

  const handleDisable = useCallback(async (mint: PublicKey) => {
    setDisabling(mint.toBase58());
    try {
      await onDisableToken(mint);
    } finally {
      setDisabling(null);
    }
  }, [onDisableToken]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  if (loading) {
    return (
      <div className="glass-card rounded-[8px] p-6">
        <div className="flex items-center space-x-2 mb-5 border-b border-[#ffffff08] pb-4">
          <svg className="w-[18px] h-[18px] text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
          <h3 className="text-[13px] font-semibold text-white">Token Vaults</h3>
        </div>
        <div className="h-20 flex items-center justify-center">
          <div className="text-zinc-500 text-[13px]">Loading tokens...</div>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="glass-card rounded-[8px] p-6">
        <div className="flex items-center justify-between mb-5 border-b border-[#ffffff08] pb-4">
          <div className="flex items-center space-x-2">
            <svg className="w-[18px] h-[18px] text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            <h3 className="text-[13px] font-semibold text-white">Token Vaults</h3>
          </div>
          {isOwner && (
            <button
              onClick={onEnableToken}
              className={`text-[11px] font-medium transition-colors ${
                isPrivate
                  ? "text-[#22d3ee] hover:text-[#06b6d4]"
                  : "text-[#8b5cf6] hover:text-[#a78bfa]"
              }`}
            >
              + Enable Token
            </button>
          )}
        </div>
        <div className="text-center py-6">
          <p className="text-zinc-500 text-[13px]">No tokens enabled</p>
          {isOwner && (
            <p className="text-zinc-600 text-[11px] mt-1">Enable USDC or other SPL tokens to use with this agent</p>
          )}
        </div>
      </div>
    );
  }

  const isEditing = editingMint === selectedToken?.mint.toBase58();

  return (
    <div className="glass-card rounded-[8px] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 border-b border-[#ffffff08] pb-4">
        <div className="flex items-center space-x-2">
          <svg className="w-[18px] h-[18px] text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
          <h3 className="text-[13px] font-semibold text-white">Token Vaults</h3>
        </div>
        {isOwner && (
          <button
            onClick={onEnableToken}
            className={`text-[11px] font-medium transition-colors ${
              isPrivate
                ? "text-[#22d3ee] hover:text-[#06b6d4]"
                : "text-[#8b5cf6] hover:text-[#a78bfa]"
            }`}
          >
            + Enable Token
          </button>
        )}
      </div>

      {/* Token tabs */}
      {tokens.length > 1 && (
        <div className="flex gap-1 mb-5 p-1 bg-[#0a0a0a] rounded-lg w-fit">
          {tokens.map((t) => {
            const mintStr = t.mint.toBase58();
            const isActive = mintStr === (selectedMint ?? tokens[0]?.mint.toBase58());
            return (
              <button
                key={mintStr}
                onClick={() => setSelectedMint(mintStr)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                  isActive
                    ? isPrivate
                      ? "bg-[#22d3ee] text-black"
                      : "bg-[#8b5cf6] text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.symbol}
              </button>
            );
          })}
        </div>
      )}

      {selectedToken && (
        <>
          {/* Balance display */}
          <div className="mb-5">
            <div className="text-[11px] font-medium text-zinc-500/80 uppercase tracking-wide mb-2">
              {selectedToken.symbol} Balance
            </div>
            <div className="text-[32px] font-bold font-mono tracking-tight text-white leading-none">
              {(selectedToken.balance / Math.pow(10, selectedToken.decimals)).toFixed(2)}
              <span className="text-lg text-zinc-500 ml-2">{selectedToken.symbol}</span>
            </div>
          </div>

          {/* Deposit address */}
          <div className="mb-5 p-3 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">
            <div className="text-[11px] font-medium text-zinc-500 mb-1">
              {selectedToken.symbol} Deposit Address
            </div>
            <button
              onClick={() => copyToClipboard(selectedToken.depositAddress.toBase58())}
              className="text-[12px] font-mono text-zinc-400 hover:text-white transition-colors break-all text-left"
              title="Click to copy"
            >
              {selectedToken.depositAddress.toBase58()}
            </button>
          </div>

          {/* Constraints */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-medium text-zinc-500/80 uppercase tracking-wide">
                {selectedToken.symbol} Constraints
              </div>
              {isOwner && !isEditing && (
                <button
                  onClick={() => handleStartEdit(selectedToken)}
                  className={`text-[11px] transition-colors ${
                    isPrivate
                      ? "text-[#22d3ee] hover:text-[#06b6d4]"
                      : "text-[#8b5cf6] hover:text-[#a78bfa]"
                  }`}
                >
                  Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Max per Transaction */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500">Max per Transaction</label>
                {isEditing ? (
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="0.01"
                    placeholder={`0 = unlimited`}
                    value={maxPerTx}
                    onChange={(e) => setMaxPerTx(e.target.value)}
                  />
                ) : (
                  <div className="constraint-item py-2.5 px-3">
                    <div className="constraint-value text-[15px]">
                      {selectedToken.constraints.maxPerTx > 0 ? (
                        <>
                          {formatToken(selectedToken.constraints.maxPerTx, selectedToken.decimals, "")}
                          <span className="constraint-unit">{selectedToken.symbol}</span>
                        </>
                      ) : (
                        <span className="constraint-unlimited text-sm">Unlimited</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Limit */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500">Daily Limit</label>
                {isEditing ? (
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="0.1"
                    placeholder={`0 = unlimited`}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                  />
                ) : (
                  <div className="constraint-item py-2.5 px-3">
                    <div className="constraint-value text-[15px]">
                      {selectedToken.constraints.dailyLimit > 0 ? (
                        <>
                          {formatToken(selectedToken.constraints.dailyLimit, selectedToken.decimals, "")}
                          <span className="constraint-unit">{selectedToken.symbol}</span>
                        </>
                      ) : (
                        <span className="constraint-unlimited text-sm">Unlimited</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Total Limit */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500">Total Limit</label>
                {isEditing ? (
                  <input
                    className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                    type="number"
                    step="1"
                    placeholder={`0 = unlimited`}
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(e.target.value)}
                  />
                ) : (
                  <div className="constraint-item py-2.5 px-3">
                    <div className="constraint-value text-[15px]">
                      {selectedToken.constraints.totalLimit > 0 ? (
                        <>
                          {formatToken(selectedToken.constraints.totalLimit, selectedToken.decimals, "")}
                          <span className="constraint-unit">{selectedToken.symbol}</span>
                        </>
                      ) : (
                        <span className="constraint-unlimited text-sm">Unlimited</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Spending stats (read only) */}
            {!isEditing && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-[#ffffff06]">
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Daily Spent</div>
                  <div className="text-[13px] font-mono text-zinc-300">
                    {formatToken(selectedToken.spending.dailySpent, selectedToken.decimals, selectedToken.symbol)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Daily Remaining</div>
                  <div className="text-[13px] font-mono text-zinc-300">
                    {selectedToken.spending.dailyRemaining === -1
                      ? "Unlimited"
                      : formatToken(selectedToken.spending.dailyRemaining, selectedToken.decimals, selectedToken.symbol)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Total Spent</div>
                  <div className="text-[13px] font-mono text-zinc-300">
                    {formatToken(selectedToken.spending.totalSpent, selectedToken.decimals, selectedToken.symbol)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Total Remaining</div>
                  <div className="text-[13px] font-mono text-zinc-300">
                    {selectedToken.spending.totalRemaining === -1
                      ? "Unlimited"
                      : formatToken(selectedToken.spending.totalRemaining, selectedToken.decimals, selectedToken.symbol)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Edit actions */}
          {isEditing && (
            <div className="flex justify-end gap-3 pt-4 border-t border-[#ffffff08]">
              <button
                onClick={() => setEditingMint(null)}
                className="px-4 py-2 text-[12px] font-medium text-zinc-400 hover:text-white transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-white text-black text-[12px] font-semibold rounded hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
              >
                {saving ? "Updating..." : "Update Constraints"}
              </button>
            </div>
          )}

          {/* Disable token action */}
          {isOwner && !isEditing && (
            <div className="pt-3 border-t border-[#ffffff06]">
              <button
                onClick={() => handleDisable(selectedToken.mint)}
                disabled={disabling === selectedToken.mint.toBase58()}
                className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
              >
                {disabling === selectedToken.mint.toBase58()
                  ? "Disabling..."
                  : `Disable ${selectedToken.symbol}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
