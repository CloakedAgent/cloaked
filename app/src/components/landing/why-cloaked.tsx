"use client"

import Link from "next/link"
import { MovingBorderButton } from "@/components/ui/moving-border-button"

const leftFeatures = [
  { title: "Autonomous Payments", desc: "Agents pay without human approval, smart contract validates" },
  { title: "Programmable Limits", desc: "Per-tx, daily, and lifetime caps, impossible to bypass" },
  { title: "Multi-Protocol", desc: "x402, MCP, and direct SDK for custom implementations" },
]

const rightFeatures = [
  { title: "Key Isolation", desc: "Agent keys never touch main wallet, keeping funds safe" },
  { title: "Zero-Knowledge", desc: "Unlinkable private transactions and private funding, no link" },
  { title: "Instant Revoke", desc: "Stop any agent in milliseconds with one click, immediatly" },
]

export function WhyCloaked() {
  return (
    <section className="relative py-32 px-6 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="text-sm font-medium tracking-wider text-[#8B5CF6] uppercase mb-4 block">
            Why Cloaked
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground mb-5 tracking-[-0.02em]">
            The agent finance layer
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            Infrastructure that makes autonomous agent commerce possible
          </p>
        </div>

        {/* Main Content with Lines - No border/container */}
        <div className="relative py-12">
          {/* Two columns with center divider */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-0">
            {/* Vertical divider line - GREEN */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px">
              <div className="h-full w-full bg-gradient-to-b from-transparent via-[#10b981]/50 to-transparent" />
            </div>

            {/* Left Column - Agent Autonomy - PURPLE */}
            <div className="md:pr-16 space-y-10 text-center">
              <div className="flex items-center justify-center gap-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="8" width="16" height="12" rx="2" />
                  <path d="M12 8V5" />
                  <circle cx="12" cy="3" r="2" />
                  <circle cx="8.5" cy="13" r="1.5" fill="#8B5CF6" stroke="none" />
                  <circle cx="15.5" cy="13" r="1.5" fill="#8B5CF6" stroke="none" />
                  <path d="M9 17h6" />
                </svg>
                <h3 className="text-xl font-medium text-[#8B5CF6]">
                  Agent Autonomy
                </h3>
              </div>

              <div className="space-y-8">
                {leftFeatures.map((item, i) => (
                  <div key={i}>
                    <h4 className="text-foreground font-medium mb-2">{item.title}</h4>
                    <p className="text-sm text-muted-foreground font-light">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column - Privacy & Control - GREEN */}
            <div className="md:pl-16 space-y-10 text-center">
              <div className="flex items-center justify-center gap-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <h3 className="text-xl font-medium text-[#10b981]">
                  Privacy & Control
                </h3>
              </div>

              <div className="space-y-8">
                {rightFeatures.map((item, i) => (
                  <div key={i}>
                    <h4 className="text-foreground font-medium mb-2">{item.title}</h4>
                    <p className="text-sm text-muted-foreground font-light">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Horizontal divider - GREY */}
          <div className="relative my-12">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            {/* Center intersection dot - GREEN */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#10b981]" />
          </div>

          {/* CTA */}
          <div className="flex justify-center pt-8">
            <Link href="/dashboard">
              <MovingBorderButton
                borderRadius="0.75rem"
                duration={5000}
                containerClassName="h-auto w-auto"
                borderClassName="bg-[radial-gradient(#8B5CF6_40%,transparent_60%)]"
                className="bg-black border-[#8B5CF6]/60 px-8 py-4 gap-3"
              >
                <span className="text-sm text-white font-normal">
                  Ready to Deploy Cloaked Agent?
                </span>
                <span className="text-sm font-medium text-[#8B5CF6]">
                  Get access
                </span>
              </MovingBorderButton>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
