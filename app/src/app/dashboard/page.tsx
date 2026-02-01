"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CloakedAgent, initProver, isProverReady } from "@cloakedagent/sdk";
import {
  useAgentTokens,
  usePrivateAgents,
  AgentToken,
  useSigner,
  PrivateAgent,
  useHydrated,
} from "@/hooks";
import { GlassCard, Button, useWalletReady, ConnectWalletPrompt } from "@/components";
import { StatCard, AgentGridCard } from "@/components/dashboard";
import { formatSol } from "@/lib/cloaked";
import { usePrivacyCash } from "@/contexts/PrivacyCashContext";

export default function DashboardPage() {
  const hydrated = useHydrated();
  const { connected } = useWallet();
  const { connection } = useConnection();
  const walletReady = useWalletReady();
  const signer = useSigner();
  const router = useRouter();
  const { tokens, loading, error, refresh } = useAgentTokens();
  const {
    agents: privateAgents,
    loading: privateLoading,
    hasMasterSecret,
    getMasterSecret,
    refresh: refreshPrivate,
  } = usePrivateAgents();
  const [proverInitialized, setProverInitialized] = useState(false);
  const { balance: privacyCashBalance, status: privacyCashStatus } = usePrivacyCash();

  // Initialize ZK prover in background
  useEffect(() => {
    if (hasMasterSecret && !proverInitialized) {
      initProver()
        .then(() => {
          setProverInitialized(true);
        })
        .catch(() => {
          // Failed to initialize ZK prover
        });
    }
  }, [hasMasterSecret, proverInitialized]);

  // Combine all agents
  const allAgents = useMemo(() => {
    const combined = [...tokens];
    if (hasMasterSecret) {
      combined.push(...privateAgents);
    }
    return combined;
  }, [tokens, privateAgents, hasMasterSecret]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalBalance = allAgents.reduce((sum, a) => sum + a.balance, 0);
    const todaySpending = allAgents.reduce(
      (sum, a) => sum + a.spending.dailySpent,
      0
    );
    const activeCount = allAgents.filter((a) => a.status === "active").length;
    const frozenCount = allAgents.filter((a) => a.status === "frozen").length;

    return {
      totalBalance,
      todaySpending,
      activeCount,
      frozenCount,
    };
  }, [allAgents]);

  // Freeze/unfreeze handlers
  const handleFreeze = useCallback(
    async (agent: AgentToken) => {
      if (!signer) return;
      try {
        const token = CloakedAgent.forOwner(
          agent.delegate,
          connection.rpcEndpoint
        );
        await token.freeze(signer);
        refresh();
      } catch {
        // Failed to freeze agent
      }
    },
    [signer, connection, refresh]
  );

  const handleUnfreeze = useCallback(
    async (agent: AgentToken) => {
      if (!signer) return;
      try {
        const token = CloakedAgent.forOwner(
          agent.delegate,
          connection.rpcEndpoint
        );
        await token.unfreeze(signer);
        refresh();
      } catch {
        // Failed to unfreeze agent
      }
    },
    [signer, connection, refresh]
  );

  const handleFreezePrivate = useCallback(
    async (agent: AgentToken) => {
      if (!hasMasterSecret || !isProverReady()) {
        return;
      }

      const masterSecret = await getMasterSecret();
      if (!masterSecret) return;

      const privateAgent = agent as PrivateAgent;
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3645";
        const token = await CloakedAgent.forPrivateOwner(
          masterSecret,
          privateAgent.nonce,
          connection.rpcEndpoint
        );
        await token.freezePrivate(apiUrl);
        refreshPrivate();
      } catch {
        // Failed to freeze private agent
      }
    },
    [hasMasterSecret, getMasterSecret, connection, refreshPrivate]
  );

  const handleUnfreezePrivate = useCallback(
    async (agent: AgentToken) => {
      if (!hasMasterSecret || !isProverReady()) {
        return;
      }

      const masterSecret = await getMasterSecret();
      if (!masterSecret) return;

      const privateAgent = agent as PrivateAgent;
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3645";
        const token = await CloakedAgent.forPrivateOwner(
          masterSecret,
          privateAgent.nonce,
          connection.rpcEndpoint
        );
        await token.unfreezePrivate(apiUrl);
        refreshPrivate();
      } catch {
        // Failed to unfreeze private agent
      }
    },
    [hasMasterSecret, getMasterSecret, connection, refreshPrivate]
  );

  // Loading state - wait for hydration and wallet initialization
  if (!hydrated || !walletReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--cloak-text-muted)]">Loading...</div>
      </div>
    );
  }

  // Not connected state
  if (!connected) {
    return (
      <ConnectWalletPrompt
        title="Connect Wallet"
        description="Connect your wallet to view and manage your agents."
      />
    );
  }

  return (
    <div className="animate-reveal">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--cloak-text-primary)] mb-1">
            Overview
          </h1>
          <p className="text-sm text-[var(--cloak-text-muted)]">
            Global spending control and agent status.
          </p>
        </div>
        <Link
          href="/dashboard/create-agent"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--cloak-violet)] hover:bg-[var(--cloak-violet-dim)] text-white text-sm font-semibold transition-all shadow-[0_0_20px_-5px_rgba(139,92,246,0.4)]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create New Agent
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          label="Total Balance"
          value={`${formatSol(stats.totalBalance, 2)} SOL`}
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          }
          meta={
            <Link
              href="/dashboard/privacy-cash"
              className="px-3 py-1.5 text-xs font-medium border border-[var(--cloak-success)]/30 rounded hover:bg-[var(--cloak-success)]/10 text-[var(--cloak-success)] transition-colors inline-flex items-center gap-2"
            >
              Add Funds
              {privacyCashStatus === "ready" && privacyCashBalance !== null && (
                <span className="text-[var(--cloak-text-dim)]">
                  · ◎ {(privacyCashBalance / 1e9).toFixed(2)}
                </span>
              )}
            </Link>
          }
          className="stat-card-primary"
        />

        <StatCard
          label="Today's Spending"
          value={`${formatSol(stats.todaySpending, 2)}`}
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
          meta={
            <span className="flex items-center gap-1.5 text-[var(--cloak-text-dim)]">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Resets at midnight UTC
            </span>
          }
        />

        <StatCard
          label="Active Agents"
          value={`${stats.activeCount}`}
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 2a1 1 0 011 1v1h2a4 4 0 014 4v6a4 4 0 01-4 4H9a4 4 0 01-4-4V8a4 4 0 014-4h2V3a1 1 0 011-1zM9 10a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zm-5 5a4 4 0 008 0H10z"
              />
            </svg>
          }
          meta={
            stats.activeCount > 0 ? (
              <span className="flex items-center gap-1.5 text-[var(--cloak-success)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cloak-success)]" />
                All systems operational
              </span>
            ) : (
              <span className="text-[var(--cloak-text-dim)]">No active agents</span>
            )
          }
        />

        <StatCard
          label="Frozen Agents"
          value={`${stats.frozenCount}`}
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          meta={
            <span className="flex items-center gap-1.5 text-[var(--cloak-text-dim)]">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              Enforcement Rate: 100%
            </span>
          }
        />
      </div>

      {/* Agent Grid Section */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--cloak-text-dim)]">
          Deployed Agents
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              refresh();
              if (hasMasterSecret) refreshPrivate();
            }}
            className="p-1.5 hover:bg-[var(--cloak-surface)] rounded text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors"
            title="Refresh"
          >
            <svg
              className={`w-4 h-4 ${loading || privateLoading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <GlassCard className="mb-6 border-[var(--cloak-error)]/30">
          <div className="flex items-center gap-3 text-[var(--cloak-error)]">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
            <button
              onClick={refresh}
              className="ml-auto text-sm underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </GlassCard>
      )}

      {/* Agent Grid */}
      {loading && allAgents.length === 0 ? (
        <div className="agent-grid">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="agent-grid-card animate-pulse"
              style={{ opacity: 1 - i * 0.15 }}
            >
              <div className="flex items-center gap-3 mb-auto">
                <div className="w-10 h-10 rounded-lg bg-[var(--cloak-surface)]" />
                <div>
                  <div className="h-4 w-24 bg-[var(--cloak-surface)] rounded mb-2" />
                  <div className="h-3 w-16 bg-[var(--cloak-surface)] rounded" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="h-3 w-full bg-[var(--cloak-surface)] rounded mb-2" />
                <div className="h-1.5 w-full bg-[var(--cloak-surface)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : allAgents.length === 0 ? (
        <GlassCard className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-surface)] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--cloak-text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--cloak-text-primary)] mb-2">
            No agents yet
          </h3>
          <p className="text-[var(--cloak-text-muted)] mb-6 max-w-sm mx-auto">
            Create your first AI agent to get started with trustless spending
            accounts.
          </p>
          <Link
            href="/dashboard/create-agent"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[var(--cloak-violet)] hover:bg-[var(--cloak-violet-dim)] text-white font-semibold transition-all"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Your First Agent
          </Link>
        </GlassCard>
      ) : (
        <div className="agent-grid">
          {allAgents.map((agent) => (
            <AgentGridCard
              key={agent.delegate.toBase58()}
              agent={agent}
              onFreeze={agent.isPrivate ? handleFreezePrivate : handleFreeze}
              onUnfreeze={
                agent.isPrivate ? handleUnfreezePrivate : handleUnfreeze
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
