"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SpiralAnimation } from "./spiral-animation"
import { StarsBackground } from "./stars-background"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center bg-black overflow-hidden">
      {/* Stars Background */}
      <StarsBackground
        starDensity={0.00025}
        twinkleProbability={0.8}
        minTwinkleSpeed={0.3}
        maxTwinkleSpeed={0.8}
        className="opacity-75"
      />

      {/* Spiral Animation - hidden on mobile for performance */}
      <div className="hidden md:block absolute bottom-[-700px] right-[-600px] opacity-80 pointer-events-none">
        <SpiralAnimation size={2000} />
      </div>

      <div className="w-full max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-screen pt-20 lg:pt-0">

          {/* Left side - Text content */}
          <div className="relative z-10">
            {/* Eyebrow */}
            <p className="text-violet text-sm font-normal tracking-wide uppercase mb-6">
              Trustless AI Agent Spending
            </p>

            {/* Hero Headline - forced 2 lines */}
            <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] xl:text-6xl font-light text-foreground leading-[1.1] tracking-[-0.02em] mb-6">
              <span className="block md:whitespace-nowrap">Give AI agents spending power</span>
              <span className="block md:whitespace-nowrap text-text-secondary">without worries about security</span>
            </h1>

            {/* Subheadline */}
            <p className="text-base md:text-lg text-muted-foreground max-w-md mb-10 leading-relaxed font-light">
              Let AI agents spend autonomously with smart contract enforced limits they literally cannot bypass.<br />
              <span className="bg-gradient-to-r from-violet to-cyan bg-clip-text text-transparent">
                Key isolation. ZK privacy. Built on Solana.
              </span>
            </p>

            {/* CTA buttons - left aligned with text */}
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link href="/dashboard">
                <button className="px-8 py-3 rounded-xl border border-[#10b981]/60 bg-black text-white text-sm font-medium hover:border-[#10b981] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all">
                  Start Building
                </button>
              </Link>
              <Link href="/docs">
                <button className="px-8 py-3 rounded-xl border border-white/40 bg-black text-white text-sm font-medium hover:border-white/60 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all flex items-center gap-2">
                  View Docs
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>

          {/* Right side - empty space for animation to show through */}
          <div className="hidden lg:block">
            {/* Placeholder for future content */}
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  )
}
