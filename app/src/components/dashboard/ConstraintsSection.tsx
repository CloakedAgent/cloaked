"use client";

import { useState, useMemo, useCallback } from "react";
import { AgentToken } from "@/hooks";
import { formatSol } from "@/lib/cloaked";

interface ConstraintsSectionProps {
  agent: AgentToken;
  isOwner: boolean;
  onSave: (constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
    expiresAt: number;
  }) => Promise<void>;
}

export function ConstraintsSection({ agent, isOwner, onSave }: ConstraintsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [maxPerTx, setMaxPerTx] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");

  const expirationDisplay = useMemo(() => {
    if (!agent.constraints.expiresAt) return { label: "Never", sublabel: null };

    const now = new Date();
    const expires = agent.constraints.expiresAt;
    const diffMs = expires.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: "Expired", isExpired: true };
    }
    if (diffDays === 0) {
      return { label: "Today", isWarning: true };
    }
    if (diffDays <= 7) {
      return { label: `${diffDays} day${diffDays === 1 ? "" : "s"}`, isWarning: true };
    }
    return { label: `${diffDays} days` };
  }, [agent.constraints.expiresAt]);

  const handleStartEdit = useCallback(() => {
    setMaxPerTx(
      agent.constraints.maxPerTx > 0 ? (agent.constraints.maxPerTx / 1e9).toString() : ""
    );
    setDailyLimit(
      agent.constraints.dailyLimit > 0 ? (agent.constraints.dailyLimit / 1e9).toString() : ""
    );
    setTotalLimit(
      agent.constraints.totalLimit > 0 ? (agent.constraints.totalLimit / 1e9).toString() : ""
    );
    if (agent.constraints.expiresAt) {
      const now = Date.now();
      const expiresAt = agent.constraints.expiresAt.getTime();
      const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      setExpiresInDays(daysRemaining > 0 ? daysRemaining.toString() : "");
    } else {
      setExpiresInDays("");
    }
    setIsEditing(true);
  }, [agent.constraints]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleResetToDefault = useCallback(() => {
    setMaxPerTx("");
    setDailyLimit("");
    setTotalLimit("");
    setExpiresInDays("");
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let expiresAt = 0;
      if (expiresInDays && parseInt(expiresInDays) > 0) {
        expiresAt = Math.floor(Date.now() / 1000) + parseInt(expiresInDays) * 86400;
      }

      await onSave({
        maxPerTx: maxPerTx ? Math.floor(parseFloat(maxPerTx) * 1e9) : 0,
        dailyLimit: dailyLimit ? Math.floor(parseFloat(dailyLimit) * 1e9) : 0,
        totalLimit: totalLimit ? Math.floor(parseFloat(totalLimit) * 1e9) : 0,
        expiresAt,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }, [maxPerTx, dailyLimit, totalLimit, expiresInDays, onSave]);

  return (
    <div className="glass-card rounded-[8px] p-6">
      <div className="flex items-center justify-between mb-5 border-b border-[#ffffff08] pb-4">
        <div className="flex items-center space-x-2">
          <svg
            className="w-[18px] h-[18px] text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
          <h3 className="text-[13px] font-semibold text-white">Spending Constraints</h3>
        </div>
        {isOwner && (
          isEditing ? (
            <button
              onClick={handleResetToDefault}
              className="text-[11px] text-zinc-500 hover:text-white transition-colors flex items-center space-x-1"
            >
              <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Reset to Default</span>
            </button>
          ) : (
            <button
              onClick={handleStartEdit}
              className="text-[11px] text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
            >
              Edit
            </button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-5">
        {/* Max per Transaction */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-500">Max per Transaction</label>
          {isEditing ? (
            <input
              className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
              type="number"
              step="0.01"
              placeholder="0 = unlimited"
              value={maxPerTx}
              onChange={(e) => setMaxPerTx(e.target.value)}
            />
          ) : (
            <div className="constraint-item py-2.5 px-3">
              <div className="constraint-value text-[15px]">
                {agent.constraints.maxPerTx > 0 ? (
                  <>{formatSol(agent.constraints.maxPerTx)} <span className="constraint-unit">SOL</span></>
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
              placeholder="0 = unlimited"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          ) : (
            <div className="constraint-item py-2.5 px-3">
              <div className="constraint-value text-[15px]">
                {agent.constraints.dailyLimit > 0 ? (
                  <>{formatSol(agent.constraints.dailyLimit)} <span className="constraint-unit">SOL</span></>
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
              placeholder="0 = unlimited"
              value={totalLimit}
              onChange={(e) => setTotalLimit(e.target.value)}
            />
          ) : (
            <div className="constraint-item py-2.5 px-3">
              <div className="constraint-value text-[15px]">
                {agent.constraints.totalLimit > 0 ? (
                  <>{formatSol(agent.constraints.totalLimit)} <span className="constraint-unit">SOL</span></>
                ) : (
                  <span className="constraint-unlimited text-sm">Unlimited</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expiration */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-500">Expiration</label>
          {isEditing ? (
            <div className="relative">
              <input
                className="glass-input w-full rounded px-3 py-2 text-[13px] font-mono placeholder-zinc-600"
                type="number"
                step="1"
                min="0"
                placeholder="days (0 = never)"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs">days</span>
            </div>
          ) : (
            <div className="constraint-item py-2.5 px-3">
              <div className={`constraint-value text-[15px] ${expirationDisplay.isExpired ? "text-[var(--cloak-error)]" : ""} ${expirationDisplay.isWarning ? "text-[var(--cloak-warning)]" : ""}`}>
                {expirationDisplay.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="flex justify-end gap-3 pt-4 border-t border-[#ffffff08]">
          <button
            onClick={handleCancel}
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
    </div>
  );
}
