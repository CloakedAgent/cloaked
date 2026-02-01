"use client"

import AgentFlowAnimation from "./agent-flow-animation"

export function HowItWorksNew() {
  return (
    <section id="how-it-works" className="relative py-32 px-6 bg-black overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left - Animation */}
          <div className="flex items-center justify-center">
            <AgentFlowAnimation />
          </div>

          {/* Right - Text Content */}
          <div>
            {/* Section label */}
            <span className="text-sm font-medium tracking-wider text-[#8B5CF6] uppercase mb-4 block">
              How It Works
            </span>

            {/* Headline */}
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground leading-[1.1] tracking-[-0.02em] mb-4">
              <span className="block">Deploy agents</span>
              <span className="block">in three steps</span>
            </h2>

            {/* Subheadline */}
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-light mb-12">
              Create isolated spending account. Give agent access token. Program executes transactions.
            </p>

            {/* Steps */}
            <div className="space-y-0">
              {/* Step 1 */}
              <div className="flex gap-5 relative">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg border border-[#8B5CF6]/30 flex items-center justify-center z-10">
                    <span className="text-[#8B5CF6] font-semibold text-base">01</span>
                  </div>
                  <div className="w-[2px] h-20 mt-2 bg-gradient-to-b from-[#8B5CF6]/50 via-[#8B5CF6]/20 to-transparent" />
                </div>
                <div className="pt-2 pb-8">
                  <h3 className="text-xl font-medium text-foreground mb-2">
                    Create Spending Account
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Connect wallet, set limits, fund with SOL
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-5 relative">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg border border-[#8B5CF6]/30 flex items-center justify-center z-10">
                    <span className="text-[#8B5CF6] font-semibold text-base">02</span>
                  </div>
                  <div className="w-[2px] h-20 mt-2 bg-gradient-to-b from-[#8B5CF6]/50 via-[#8B5CF6]/20 to-transparent" />
                </div>
                <div className="pt-2 pb-8">
                  <h3 className="text-xl font-medium text-foreground mb-2">
                    Configure AI Agent
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Add Agent Key to Claude or GPT via MCP, or integrate with the SDK
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-5 relative">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg border border-[#8B5CF6]/30 flex items-center justify-center z-10">
                    <span className="text-[#8B5CF6] font-semibold text-base">03</span>
                  </div>
                </div>
                <div className="pt-2 pb-8">
                  <h3 className="text-xl font-medium text-foreground mb-2">
                    Monitor & Control
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Real-time visibility, instant freeze, adjust limits anytime
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
