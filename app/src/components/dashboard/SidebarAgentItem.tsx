"use client";

import { memo, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { AgentToken } from "@/hooks";
import { formatSol } from "@/lib/cloaked";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { CLOAKED_PROGRAM_ID } from "@/lib/constants";

interface SidebarAgentItemProps {
  agent: AgentToken;
  isSelected: boolean;
  onClick: () => void;
}

export const SidebarAgentItem = memo(function SidebarAgentItem({
  agent,
  isSelected,
  onClick,
}: SidebarAgentItemProps) {
  const { getName } = useAgentNames();

  const displayName = useMemo(() => {
    // Derive vault PDA to get name
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agent.address.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    const storedName = getName(vaultPda.toBase58());
    if (storedName) return storedName;

    // Fallback to truncated delegate
    const delegateStr = agent.delegate.toBase58();
    return `Agent ${delegateStr.slice(0, 4)}...${delegateStr.slice(-4)}`;
  }, [agent.address, agent.delegate, getName]);

  const statusClass = useMemo(() => {
    if (agent.status === "frozen") return "frozen";
    if (agent.status === "expired") return "expired";
    // For active, check if there's recent activity (we don't have this data, so just show active)
    return "active";
  }, [agent.status]);

  return (
    <div
      className={`sidebar-agent-item ${isSelected ? "selected" : ""} ${agent.isPrivate ? "cloaked" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`status-dot-sm ${statusClass}`} />
        <div className="min-w-0 flex items-center gap-2">
          <div className="agent-name truncate">{displayName}</div>
          {agent.isPrivate && (
            <svg className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Cloaked Agent</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </div>
      </div>
      <span className="agent-balance">
        {formatSol(agent.balance, 2)}
      </span>
    </div>
  );
});
