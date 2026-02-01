"use client"

import { useState } from "react"
import { Pause, Play, Settings, Bell, Lock, EyeOff, ArrowUpRight, ArrowDownLeft, ExternalLink } from "lucide-react"

type AgentStatus = "active" | "frozen" | "cloaked"

interface AgentData {
  name: string
  icon: "brain" | "bolt" | "shield"
  balance: number
  maxPerTx: number
  dailyLimit: number
  dailySpent: number
  totalLimit: number
  expiresIn: string
  status: AgentStatus
  isCloaked: boolean
  lastActivity: string
}

// Icon components matching the real dashboard
function BrainIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function BoltIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function ShieldIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

function ConstraintsIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  )
}

const AgentIcon = ({ icon, className }: { icon: AgentData["icon"]; className?: string }) => {
  switch (icon) {
    case "brain":
      return <BrainIcon className={className} />
    case "bolt":
      return <BoltIcon className={className} />
    case "shield":
      return <ShieldIcon className={className} />
  }
}

function MobileDashboardCard({ agents }: { agents: AgentData[] }) {
  const totalBalance = agents[0].balance + agents[1].balance
  const totalDailySpent = agents[0].dailySpent + agents[1].dailySpent
  const displayAgents = agents.slice(0, 2)

  return (
    <div className="relative bg-black/60 backdrop-blur-2xl rounded-xl border border-white/[0.1] overflow-hidden shadow-2xl">
      {/* Window Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-black/40">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">Cloaked Dashboard</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-emerald-400/[0.02] border border-emerald-400/20">
            <p className="text-2xl font-light text-foreground font-mono">
              {totalBalance.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">SOL</p>
          </div>
          <div className="p-3 rounded-lg bg-cyan/[0.02] border border-cyan/20">
            <p className="text-2xl font-light text-foreground font-mono">
              {totalDailySpent.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Daily</p>
          </div>
        </div>

        {/* Agent List */}
        <div className="space-y-2">
          {displayAgents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-white/[0.02] border border-white/[0.06]"
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-md ${agent.isCloaked ? "bg-violet/10 border border-violet/30" : "bg-emerald-400/10 border border-emerald-400/30"}`}>
                <AgentIcon icon={agent.icon} className={`w-4 h-4 ${agent.isCloaked ? "text-violet" : "text-emerald-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-foreground truncate">{agent.name}</p>
                  {agent.isCloaked && <Lock className="w-3 h-3 text-violet" />}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${agent.isCloaked ? "bg-violet" : "bg-emerald-400"}`} />
                  {agent.isCloaked ? "Cloaked" : "Active"} · {agent.lastActivity}
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono text-foreground">{agent.balance.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground ml-0.5">SOL</span>
              </div>
            </div>
          ))}
        </div>

        {/* Constraints Summary */}
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <ConstraintsIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Spending Constraints</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Max/Tx: <span className="text-foreground font-mono">0.5</span></span>
            <span className="text-muted-foreground">Daily: <span className="text-foreground font-mono">1</span></span>
            <span className="text-muted-foreground">Total: <span className="text-foreground font-mono">10</span></span>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.08] bg-black/40">
        <span className="text-xs text-muted-foreground">
          2 agents · 1 private · Mainnet
        </span>
      </div>
    </div>
  )
}

export function DashboardPreview() {
  const agents: AgentData[] = [
    {
      name: "Research Agent",
      icon: "brain",
      balance: 2.34,
      maxPerTx: 0.5,
      dailyLimit: 1.0,
      dailySpent: 0.45,
      totalLimit: 10.0,
      expiresIn: "30 days",
      status: "active",
      isCloaked: false,
      lastActivity: "2 min ago",
    },
    {
      name: "Data Scout",
      icon: "shield",
      balance: 4.12,
      maxPerTx: 1.0,
      dailyLimit: 2.0,
      dailySpent: 0.23,
      totalLimit: 0,
      expiresIn: "Never",
      status: "cloaked",
      isCloaked: true,
      lastActivity: "5 min ago",
    },
    {
      name: "API Caller",
      icon: "bolt",
      balance: 0.89,
      maxPerTx: 0.2,
      dailyLimit: 0.8,
      dailySpent: 0.67,
      totalLimit: 5.0,
      expiresIn: "14 days",
      status: "frozen",
      isCloaked: false,
      lastActivity: "1 hour ago",
    },
  ]

  // Different spending history per agent
  const spendingHistories: Record<string, Array<{ type: string; desc: string; amount: number; time: string; to?: string; from?: string }>> = {
    "Research Agent": [
      { type: "out", desc: "x402 API call", amount: 0.015, time: "2 min ago", to: "3xK9...mP2q" },
      { type: "out", desc: "Data indexer", amount: 0.003, time: "18 min ago", to: "9dF4...nR7w" },
      { type: "in", desc: "Funded", amount: 1.5, time: "2 hours ago", from: "Owner" },
    ],
    "Data Scout": [
      { type: "out", desc: "Private relay", amount: 0.02, time: "5 min ago", to: "Hidden" },
      { type: "out", desc: "Stealth payment", amount: 0.008, time: "32 min ago", to: "Hidden" },
      { type: "in", desc: "Privacy Cash", amount: 2.0, time: "1 day ago", from: "Anonymous" },
    ],
    "API Caller": [
      { type: "out", desc: "Helius RPC", amount: 0.008, time: "1 hour ago", to: "7bN2...kL4x" },
      { type: "out", desc: "Jupiter swap", amount: 0.12, time: "3 hours ago", to: "JUP4...Gh2k" },
      { type: "in", desc: "Funded", amount: 0.5, time: "1 day ago", from: "Owner" },
    ],
  }

  const [selectedIdx, setSelectedIdx] = useState(0)
  const selectedAgent = agents[selectedIdx]

  const getStatusBadge = (agent: AgentData) => {
    if (agent.isCloaked) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet/10 text-violet border border-violet/20">
          <EyeOff className="w-3 h-3" />
          Cloaked
        </span>
      )
    }
    if (agent.status === "frozen") {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs bg-cyan/10 text-cyan border border-cyan/20">
          Frozen
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
        Active
      </span>
    )
  }

  const getCardStyle = (agent: AgentData, isSelected: boolean) => {
    let base = "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all "

    if (isSelected) {
      if (agent.isCloaked) {
        return base + "bg-violet/10 border border-violet/30 shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)]"
      }
      if (agent.status === "frozen") {
        return base + "bg-cyan/10 border border-cyan/30 shadow-[0_0_15px_-5px_rgba(34,211,238,0.3)]"
      }
      return base + "bg-violet/10 border border-violet/20"
    }

    return base + "hover:bg-white/[0.04] border border-transparent"
  }

  const getIconStyle = (agent: AgentData) => {
    if (agent.isCloaked) {
      return "text-violet"
    }
    if (agent.status === "frozen") {
      return "text-cyan"
    }
    return "text-emerald-400"
  }

  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center py-32 px-6 bg-black overflow-hidden pattern-grid">
      <div className="relative z-10 max-w-5xl mx-auto w-full">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-violet text-sm font-normal tracking-wide uppercase mb-4">
            Control Center
          </p>
          <h2 className="text-3xl md:text-4xl font-light text-foreground mb-6 text-balance tracking-[-0.02em]">
            Monitor every agent, every transaction
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto text-pretty font-light">
            Real-time visibility into agent spending. Set constraints, adjust limits,
            freeze instantly. Full control, always.
          </p>
        </div>

        {/* Mobile Dashboard Card */}
        <div className="md:hidden">
          <MobileDashboardCard agents={agents} />
        </div>

        {/* Desktop Dashboard Mock Window */}
        <div className="relative hidden md:block">
          {/* Main Window */}
          <div className="relative bg-black/60 backdrop-blur-2xl rounded-xl border border-white/[0.1] overflow-hidden shadow-2xl">
            {/* Window Title Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-black/40">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="text-xs text-muted-foreground ml-3">Cloaked Dashboard</span>
              </div>
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Content Area */}
            <div className="flex min-h-[460px]">
              {/* Sidebar - Agent List */}
              <div className="w-64 border-r border-white/[0.08] bg-black/30 flex flex-col">
                {/* Cloaked Agents Indicator */}
                <div className="p-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-violet/5 border border-violet/20">
                    <div className="w-6 h-6 rounded-full bg-violet/10 flex items-center justify-center">
                      <EyeOff className="w-3 h-3 text-violet" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-violet font-medium">1 Cloaked Agent</p>
                      <p className="text-[10px] text-muted-foreground">Private & untraceable</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 px-2">Your Agents</p>
                  {agents.map((agent, idx) => (
                    <div
                      key={agent.name}
                      className={getCardStyle(agent, idx === selectedIdx)}
                      onClick={() => setSelectedIdx(idx)}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-md ${agent.isCloaked ? "bg-violet/10 border border-violet/30" : agent.status === "frozen" ? "bg-cyan/10 border border-cyan/30" : "bg-emerald-400/10 border border-emerald-400/30"}`}>
                        <AgentIcon icon={agent.icon} className={`w-4 h-4 ${getIconStyle(agent)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-foreground truncate">{agent.name}</p>
                          {agent.isCloaked && <Lock className="w-3 h-3 text-violet" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{agent.lastActivity}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-muted-foreground">{agent.balance.toFixed(2)}</span>
                        <span className="text-[10px] text-muted-foreground ml-0.5">SOL</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content - Agent Details */}
              <div className="flex-1 p-6 bg-black/20">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${selectedAgent.isCloaked ? "bg-violet/10 border border-violet/30" : selectedAgent.status === "frozen" ? "bg-cyan/10 border border-cyan/30" : "bg-emerald-400/10 border border-emerald-400/30"}`}>
                      <AgentIcon icon={selectedAgent.icon} className={`w-5 h-5 ${getIconStyle(selectedAgent)}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg text-foreground font-normal">{selectedAgent.name}</h3>
                        {getStatusBadge(selectedAgent)}
                      </div>
                      <p className="text-sm text-muted-foreground">Last activity: {selectedAgent.lastActivity}</p>
                    </div>
                  </div>
                  {selectedAgent.status === "frozen" ? (
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan/30 text-sm text-cyan hover:bg-cyan/10 transition-all">
                      <Play className="w-3.5 h-3.5" />
                      Unfreeze
                    </button>
                  ) : (
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/[0.08] text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-all">
                      <Pause className="w-3.5 h-3.5" />
                      Freeze
                    </button>
                  )}
                </div>

                {/* Balance Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className={`p-4 rounded-lg border ${selectedAgent.isCloaked ? "bg-violet/[0.02] border-violet/20" : selectedAgent.status === "frozen" ? "bg-cyan/[0.02] border-cyan/20" : "bg-emerald-400/[0.02] border-emerald-400/20"}`}>
                    <p className="text-xs text-muted-foreground mb-1">Balance</p>
                    <p className="text-2xl font-light text-foreground font-mono">
                      {selectedAgent.balance.toFixed(2)} <span className="text-sm text-muted-foreground">SOL</span>
                    </p>
                    <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${selectedAgent.isCloaked ? "bg-violet" : selectedAgent.status === "frozen" ? "bg-cyan" : "bg-emerald-400"}`}
                        style={{ width: `${Math.min((selectedAgent.balance / 5) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg border ${selectedAgent.isCloaked ? "bg-violet/[0.02] border-violet/20" : selectedAgent.status === "frozen" ? "bg-cyan/[0.02] border-cyan/20" : "bg-emerald-400/[0.02] border-emerald-400/20"}`}>
                    <p className="text-xs text-muted-foreground mb-1">Daily Spent</p>
                    <p className="text-2xl font-light text-foreground font-mono">
                      {selectedAgent.dailySpent.toFixed(2)} <span className="text-sm text-muted-foreground">SOL</span>
                    </p>
                    <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${selectedAgent.dailySpent / selectedAgent.dailyLimit > 0.8 ? "bg-amber-400" : "bg-cyan"}`}
                        style={{ width: `${(selectedAgent.dailySpent / selectedAgent.dailyLimit) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">of {selectedAgent.dailyLimit.toFixed(1)} SOL daily limit</p>
                  </div>
                </div>

                {/* Two Column: Constraints + Spending History */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Spending Constraints */}
                  <div className={`p-4 rounded-lg border ${selectedAgent.isCloaked ? "bg-violet/[0.02] border-violet/20" : selectedAgent.status === "frozen" ? "bg-cyan/[0.02] border-cyan/20" : "bg-emerald-400/[0.02] border-emerald-400/20"}`}>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
                      <div className="flex items-center gap-2">
                        <ConstraintsIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">Spending Constraints</span>
                      </div>
                      <button className="text-xs text-violet hover:text-violet/80 transition-colors">
                        Edit
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Max per Tx</p>
                        <div className="py-2 px-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                          <span className="text-sm font-mono text-foreground">
                            {selectedAgent.maxPerTx > 0 ? `${selectedAgent.maxPerTx}` : "∞"}
                          </span>
                          {selectedAgent.maxPerTx > 0 && <span className="text-[10px] text-muted-foreground ml-1">SOL</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Daily Limit</p>
                        <div className="py-2 px-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                          <span className="text-sm font-mono text-foreground">{selectedAgent.dailyLimit}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">SOL</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total Limit</p>
                        <div className="py-2 px-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                          <span className="text-sm font-mono text-foreground">
                            {selectedAgent.totalLimit > 0 ? `${selectedAgent.totalLimit}` : "∞"}
                          </span>
                          {selectedAgent.totalLimit > 0 && <span className="text-[10px] text-muted-foreground ml-1">SOL</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Expires</p>
                        <div className="py-2 px-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                          <span className={`text-sm font-mono ${selectedAgent.expiresIn === "Never" ? "text-muted-foreground" : "text-foreground"}`}>
                            {selectedAgent.expiresIn}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Spending History */}
                  <div className={`p-4 rounded-lg border ${selectedAgent.isCloaked ? "bg-violet/[0.02] border-violet/20" : selectedAgent.status === "frozen" ? "bg-cyan/[0.02] border-cyan/20" : "bg-emerald-400/[0.02] border-emerald-400/20"}`}>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
                      <span className="text-xs font-medium text-foreground">Spending History</span>
                      <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                        View all
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {spendingHistories[selectedAgent.name]?.map((tx, i) => (
                        <div key={i} className="flex items-center gap-3 py-2 px-2.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${tx.type === "in" ? "bg-emerald-400/10" : "bg-white/[0.04]"}`}>
                            {tx.type === "in" ? (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate">{tx.desc}</p>
                            <p className="text-[10px] text-muted-foreground">{tx.type === "in" ? tx.from : tx.to}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-mono ${tx.type === "in" ? "text-emerald-400" : "text-foreground"}`}>
                              {tx.type === "in" ? "+" : "-"}{tx.amount} SOL
                            </p>
                            <p className="text-[10px] text-muted-foreground">{tx.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.08] bg-black/40">
              <span className="text-xs text-muted-foreground">
                3 agents • 1 active • 1 frozen • 1 cloaked
              </span>
              <span className="text-xs text-muted-foreground">Solana Mainnet</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
