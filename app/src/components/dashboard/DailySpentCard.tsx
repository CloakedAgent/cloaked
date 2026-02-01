"use client";

import { useMemo } from "react";
import { AgentToken } from "@/hooks";
import { formatSol } from "@/lib/cloaked";

interface DailySpentCardProps {
  agent: AgentToken;
}

export function DailySpentCard({ agent }: DailySpentCardProps) {
  const dailyPercentage = useMemo(() => {
    if (agent.constraints.dailyLimit === 0) return 0;
    return Math.min(100, (agent.spending.dailySpent / agent.constraints.dailyLimit) * 100);
  }, [agent.constraints.dailyLimit, agent.spending.dailySpent]);

  const resetCountdown = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }, []);

  const isNearLimit = dailyPercentage > 80;

  return (
    <div className="glass-card p-5 rounded-[8px] flex flex-col justify-between h-[150px]">
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-medium text-zinc-500/80 uppercase tracking-wide">
          Daily Spent
        </span>
        <svg
          className="w-[18px] h-[18px] text-zinc-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <div>
        <div className="text-[40px] font-bold font-mono tracking-tight text-white leading-none mb-4">
          {formatSol(agent.spending.dailySpent)}
          <span className="text-lg text-zinc-500 ml-2">SOL</span>
        </div>
        <div className="w-full bg-[#1a1a1a] h-[4px] rounded-full overflow-hidden mb-2">
          <div
            className={`h-full ${isNearLimit ? "bg-[#f59e0b]" : "bg-[#22d3ee]"}`}
            style={{ width: agent.constraints.dailyLimit > 0 ? `${dailyPercentage}%` : "0%" }}
          />
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-zinc-500 italic">
            {agent.constraints.dailyLimit > 0
              ? `Resets in ${resetCountdown}`
              : "No daily limit"}
          </span>
          <span className="text-zinc-400 font-mono">
            {agent.constraints.dailyLimit > 0
              ? `${formatSol(agent.constraints.dailyLimit)} SOL Limit`
              : "Unlimited"}
          </span>
        </div>
      </div>
    </div>
  );
}
