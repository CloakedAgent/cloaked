"use client";

import { memo, useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { AgentToken } from "@/hooks";
import { formatSol } from "@/lib/cloaked";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { CLOAKED_PROGRAM_ID } from "@/lib/constants";
import { getAgentIconSvg } from "@/lib/agentIcons";

interface AgentGridCardProps {
  agent: AgentToken;
  onFreeze?: (agent: AgentToken) => Promise<void>;
  onUnfreeze?: (agent: AgentToken) => Promise<void>;
}

export const AgentGridCard = memo(function AgentGridCard({
  agent,
  onFreeze,
  onUnfreeze,
}: AgentGridCardProps) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState(false);
  const { getName, getIcon } = useAgentNames();

  const vaultAddress = useMemo(() => {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agent.address.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return vaultPda.toBase58();
  }, [agent.address]);

  const displayName = useMemo(() => {
    const storedName = getName(vaultAddress);
    if (storedName) return storedName;

    const delegateStr = agent.delegate.toBase58();
    return `Agent ${delegateStr.slice(0, 4)}...`;
  }, [agent.delegate, getName, vaultAddress]);

  const agentIcon = useMemo(() => {
    const icon = getIcon(vaultAddress);
    return getAgentIconSvg(icon, { className: "w-7 h-7" });
  }, [getIcon, vaultAddress]);

  const statusClass = useMemo(() => {
    if (agent.status === "frozen") return "frozen";
    if (agent.status === "expired") return "expired";
    return "active";
  }, [agent.status]);

  const statusLabel = useMemo(() => {
    if (agent.status === "frozen") return "Frozen";
    if (agent.status === "expired") return "Expired";
    return "Active";
  }, [agent.status]);

  // Calculate daily spending percentage
  const dailyPercentage = useMemo(() => {
    if (agent.constraints.dailyLimit === 0) return 0;
    return Math.min(
      100,
      (agent.spending.dailySpent / agent.constraints.dailyLimit) * 100
    );
  }, [agent.constraints.dailyLimit, agent.spending.dailySpent]);

  const handleClick = useCallback(() => {
    router.push(`/dashboard/agents/${agent.delegate.toBase58()}`);
  }, [router, agent.delegate]);

  const handleFreeze = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onFreeze) return;
      setActionLoading(true);
      try {
        await onFreeze(agent);
      } finally {
        setActionLoading(false);
      }
    },
    [agent, onFreeze]
  );

  const handleUnfreeze = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onUnfreeze) return;
      setActionLoading(true);
      try {
        await onUnfreeze(agent);
      } finally {
        setActionLoading(false);
      }
    },
    [agent, onUnfreeze]
  );

  const handleViewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      router.push(`/dashboard/agents/${agent.delegate.toBase58()}`);
    },
    [router, agent.delegate]
  );

  const handleFundClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      router.push(`/dashboard/agents/${agent.delegate.toBase58()}/fund`);
    },
    [router, agent.delegate]
  );

  const cardClasses = [
    "agent-grid-card",
    agent.isPrivate && "cloaked",
    agent.status === "frozen" && "frozen",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClasses} onClick={handleClick}>
      <div className="agent-grid-card-header">
        <div className="flex items-center gap-3">
          <div className={`agent-grid-card-icon ${agent.isPrivate ? "cloaked" : ""}`}>{agentIcon}</div>
          <div>
            <div className="agent-grid-card-title flex items-center gap-2">
              {displayName}
              {agent.isPrivate && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  Cloaked
                </span>
              )}
            </div>
            <div className="agent-grid-card-status">
              <span className={`status-dot-sm ${statusClass}`} />
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="agent-grid-card-actions">
          <button
            className="agent-grid-card-action"
            onClick={handleViewClick}
            title="View Details"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            className="agent-grid-card-action"
            onClick={handleFundClick}
            title="Add Funds"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </button>
          <button
            className={`agent-grid-card-action freeze ${actionLoading ? "opacity-50" : ""}`}
            onClick={agent.status === "frozen" ? handleUnfreeze : handleFreeze}
            disabled={actionLoading}
            title={agent.status === "frozen" ? "Resume" : "Pause"}
          >
            {agent.status === "frozen" ? (
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="agent-grid-card-spending">
        <div className="agent-grid-card-spending-header">
          <span className="agent-grid-card-spending-label">Daily Spending</span>
          <span className="agent-grid-card-spending-value">
            {formatSol(agent.spending.dailySpent, 2)}{" "}
            <span>
              / {agent.constraints.dailyLimit === 0 ? "∞" : formatSol(agent.constraints.dailyLimit, 0)}
            </span>
          </span>
        </div>
        <div className="dashboard-progress">
          <div
            className={`dashboard-progress-fill ${agent.isPrivate ? "cyan" : ""}`}
            style={{ width: `${dailyPercentage}%` }}
          />
        </div>
      </div>

      <div className="agent-grid-card-balance">
        <span className="agent-grid-card-balance-label">Available Balance</span>
        <span className="agent-grid-card-balance-value">
          {formatSol(agent.balance, 2)} SOL
        </span>
      </div>
    </div>
  );
});
