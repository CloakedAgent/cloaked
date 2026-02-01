"use client";

import { memo, useState, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { AgentToken } from "@/hooks";
import { SidebarAgentItem } from "./SidebarAgentItem";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { CLOAKED_PROGRAM_ID } from "@/lib/constants";

interface DashboardSidebarProps {
  agents: AgentToken[];
  loading: boolean;
  privateAgents?: AgentToken[];
  privateLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  hasMasterSecret?: boolean;
  onUnlockPrivate?: () => void;
  isUnlocking?: boolean;
}

export const DashboardSidebar = memo(function DashboardSidebar({
  agents,
  loading,
  privateAgents = [],
  privateLoading = false,
  isOpen = false,
  onClose,
  hasMasterSecret,
  onUnlockPrivate,
  isUnlocking = false,
}: DashboardSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const { getName } = useAgentNames();

  // Combine all agents
  const allAgents = useMemo(() => {
    return [...agents, ...privateAgents];
  }, [agents, privateAgents]);

  // Filter agents by search query (name or delegate address)
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return allAgents;
    const query = searchQuery.toLowerCase();
    return allAgents.filter((agent) => {
      // Search by delegate address
      const delegateStr = agent.delegate.toBase58().toLowerCase();
      if (delegateStr.includes(query)) return true;

      // Search by stored name
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agent.address.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
      const storedName = getName(vaultPda.toBase58());
      if (storedName && storedName.toLowerCase().includes(query)) return true;

      return false;
    });
  }, [allAgents, searchQuery, getName]);

  // Get selected agent ID from pathname
  const selectedAgentId = useMemo(() => {
    const match = pathname.match(/\/dashboard\/agents\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const isOverviewActive = pathname === "/dashboard";

  const handleAgentClick = useCallback(
    (agent: AgentToken) => {
      router.push(`/dashboard/agents/${agent.delegate.toBase58()}`);
      onClose?.();
    },
    [router, onClose]
  );

  const isLoading = loading || privateLoading;

  return (
    <aside className={`dashboard-sidebar ${isOpen ? "open" : ""}`}>
      {/* Search */}
      <div className="sidebar-search">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Overview Nav */}
      <nav className="sidebar-nav">
        <Link
          href="/dashboard"
          className={`sidebar-nav-item ${isOverviewActive ? "active" : ""}`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
          <span>Overview</span>
        </Link>
      </nav>

      {/* Agent List Header */}
      <div className="sidebar-section-header">Active Agents</div>

      {/* Unlock Cloaked Agents Button */}
      {!hasMasterSecret && onUnlockPrivate && (
        <div className="px-4 pb-4 pt-2 border-b border-[#141414]">
          <button
            onClick={onUnlockPrivate}
            disabled={isUnlocking}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/10 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/15 flex items-center justify-center">
              {isUnlocking ? (
                <div className="w-4 h-4 border-2 border-[#8b5cf6]/30 border-t-[#8b5cf6] rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="text-[12px] font-medium text-zinc-200 group-hover:text-white transition-colors">
                {isUnlocking ? "Signing..." : "Unlock Cloaked Agents"}
              </div>
              <div className="text-[10px] text-zinc-500">
                Sign message to decrypt
              </div>
            </div>
            <svg className="w-4 h-4 text-[#8b5cf6]/50 group-hover:text-[#8b5cf6] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Cloaked Agents Unlocked Indicator */}
      {hasMasterSecret && privateAgents.length > 0 && (
        <div className="px-4 pb-3 pt-2 border-b border-[#141414]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#8b5cf6]/5 border border-[#8b5cf6]/15">
            <svg className="w-3.5 h-3.5 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] text-[#8b5cf6] font-medium">{privateAgents.length} Cloaked Agent{privateAgents.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {/* Agent List */}
      <div className="dashboard-sidebar-content">
        {isLoading && allAgents.length === 0 ? (
          // Loading skeletons
          <div className="space-y-2 px-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="sidebar-agent-item animate-pulse"
                style={{ opacity: 1 - i * 0.2 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--cloak-surface)]" />
                  <div className="h-4 w-24 bg-[var(--cloak-surface)] rounded" />
                </div>
                <div className="h-4 w-12 bg-[var(--cloak-surface)] rounded" />
              </div>
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[var(--cloak-text-dim)] text-xs">
              {searchQuery ? "No agents found" : "No agents yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredAgents.map((agent) => (
              <SidebarAgentItem
                key={agent.delegate.toBase58()}
                agent={agent}
                isSelected={selectedAgentId === agent.delegate.toBase58()}
                onClick={() => handleAgentClick(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="dashboard-footer">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              allAgents.length > 0
                ? "bg-[var(--cloak-success)]"
                : "bg-[var(--cloak-text-dim)]"
            }`}
          />
          <span>{allAgents.length} agents</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full border border-[var(--cloak-text-dim)]" />
          <span>Devnet</span>
        </div>
      </div>
    </aside>
  );
});
