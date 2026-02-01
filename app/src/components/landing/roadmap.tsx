"use client"

import { Code, Shield, Zap, Rocket, Network, Lock } from "lucide-react"
import RadialOrbitalTimeline from "@/components/ui/radial-orbital-timeline"

const roadmapData = [
  {
    id: 1,
    title: "Agent Tokens",
    date: "Q1 2026",
    content: "Core infrastructure with key isolation, programmable spending limits, and on-chain enforcement",
    category: "Foundation",
    icon: Lock,
    relatedIds: [2, 3],
    status: "completed" as const,
    energy: 100,
  },
  {
    id: 2,
    title: "x402 Protocol",
    date: "Q1 2026",
    content: "Native x402 integration enabling autonomous HTTP payments for AI agent commerce",
    category: "Integration",
    icon: Network,
    relatedIds: [1, 4],
    status: "completed" as const,
    energy: 100,
  },
  {
    id: 3,
    title: "Privacy Layer",
    date: "Q1 2026",
    content: "Zero-knowledge proofs for hidden ownership, unlinkable transactions, and private operations",
    category: "Security",
    icon: Shield,
    relatedIds: [1, 5],
    status: "completed" as const,
    energy: 100,
  },
  {
    id: 4,
    title: "MCP Support",
    date: "Q1 2026",
    content: "Model Context Protocol server for Claude, GPT, and other AI agents to manage wallets directly",
    category: "Integration",
    icon: Code,
    relatedIds: [2, 6],
    status: "completed" as const,
    energy: 100,
  },
  {
    id: 5,
    title: "SPL Support",
    date: "Q1 2026",
    content: "Multi-token support for USDC, USDT, and any SPL token with the same spending constraints",
    category: "Expansion",
    icon: Zap,
    relatedIds: [3, 6],
    status: "in-progress" as const,
    energy: 50,
  },
  {
    id: 6,
    title: "Policy Automation",
    date: "Q2 2026",
    content: "Rules that run themselves: when to spend, where to spend, how often",
    category: "Platform",
    icon: Rocket,
    relatedIds: [4, 5],
    status: "pending" as const,
    energy: 15,
  },
  {
    id: 7,
    title: "UCP Protocol",
    date: "Q3 2026",
    content: "Universal Commerce Protocol integration for seamless shopping at millions of merchants via AI agents",
    category: "Integration",
    icon: Network,
    relatedIds: [6],
    status: "pending" as const,
    energy: 5,
  },
]

export function Roadmap() {
  return (
    <section id="roadmap" className="relative py-24 md:py-32 bg-void overflow-hidden pattern-grid">
      {/* Smooth gradient fade from left (pattern visible) to right (black) - 50/50 split */}
      <div
        className="absolute inset-y-0 left-0 right-0 pointer-events-none z-[1]"
        style={{
          background: 'linear-gradient(to right, transparent 0%, transparent 47%, rgba(0,0,0,0.5) 51%, rgba(0,0,0,0.85) 57%, black 63%)'
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Text Content */}
          <div className="space-y-8 lg:py-12">
            <div>
              <span className="text-sm font-medium tracking-wider text-[#8B5CF6] uppercase mb-4 block">
                Roadmap
              </span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground mb-6 tracking-[-0.02em]">
                Building the future of{" "}
                <span className="text-[#10b981]">agent finance</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed">
                Our mission is to create the foundational infrastructure that enables truly autonomous agent commerce.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex gap-3 px-4 py-3 rounded-lg bg-black border border-white/10">
                <Lock className="w-5 h-5 text-[#8B5CF6] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm text-foreground font-medium mb-1">Security First</h3>
                  <p className="text-sm text-muted-foreground font-light">
                    Key isolation and on-chain enforcement at every layer
                  </p>
                </div>
              </div>

              <div className="flex gap-3 px-4 py-3 rounded-lg bg-black border border-white/10">
                <Network className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm text-foreground font-medium mb-1">Protocol Agnostic</h3>
                  <p className="text-sm text-muted-foreground font-light">
                    Compatible with x402, MCP, and direct SDK integration
                  </p>
                </div>
              </div>

              <div className="flex gap-3 px-4 py-3 rounded-lg bg-black border border-white/10">
                <Rocket className="w-5 h-5 text-[#8B5CF6] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm text-foreground font-medium mb-1">Developer Ready</h3>
                  <p className="text-sm text-muted-foreground font-light">
                    Simple SDK that lets you integrate agent payments seamlessly
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">

            </div>
          </div>

          {/* Right Column - Orbital Timeline */}
          <div className="relative h-[500px] lg:h-[600px] flex items-center justify-center">
            <RadialOrbitalTimeline timelineData={roadmapData} />
          </div>
        </div>
      </div>
    </section>
  )
}
