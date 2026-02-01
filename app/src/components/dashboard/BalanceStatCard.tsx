"use client";

import { useMemo } from "react";
import { AgentToken } from "@/hooks";
import { formatSol } from "@/lib/cloaked";

interface BalanceStatCardProps {
  agent: AgentToken;
}

export function BalanceStatCard({ agent }: BalanceStatCardProps) {
  const totalPercentage = useMemo(() => {
    if (agent.constraints.totalLimit === 0) return 0;
    const spent = agent.constraints.totalLimit - agent.balance;
    return Math.min(100, Math.max(0, (spent / agent.constraints.totalLimit) * 100));
  }, [agent.balance, agent.constraints.totalLimit]);

  const allocationPercentage = useMemo(() => {
    if (agent.constraints.totalLimit === 0) return 100;
    return Math.min(100, Math.max(0, (agent.balance / agent.constraints.totalLimit) * 100));
  }, [agent.balance, agent.constraints.totalLimit]);

  return (
    <div className="glass-card p-5 rounded-[8px] flex flex-col justify-between h-[150px]">
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-medium text-zinc-500/80 uppercase tracking-wide">
          Available Balance
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
            d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
          />
        </svg>
      </div>
      <div>
        <div className="text-[40px] font-bold font-mono tracking-tight text-white leading-none mb-4">
          {formatSol(agent.balance)}
          <span className="text-lg text-zinc-500 ml-2">SOL</span>
        </div>
        <div className="w-full bg-[#1a1a1a] h-[4px] rounded-full overflow-hidden mb-2">
          <div
            className={`h-full ${agent.isPrivate ? "bg-[#22d3ee]" : "bg-[#8b5cf6]"}`}
            style={{ width: `${allocationPercentage}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-zinc-500 italic">
            {agent.constraints.totalLimit > 0
              ? `${Math.round(allocationPercentage)}% of total allocation`
              : "No limit set"}
          </span>
          <span className="text-zinc-400 font-mono">
            {agent.constraints.totalLimit > 0
              ? `${formatSol(agent.constraints.totalLimit)} SOL Limit`
              : "Unlimited"}
          </span>
        </div>
      </div>
    </div>
  );
}
