"use client"

import { X, Check, ArrowRight } from "lucide-react"

const comparisons = [
  {
    problem: {
      title: "Sandboxed with manual approvals",
      description: "Every transaction needs your signature\nKills autonomy, creates bottleneck",
    },
    solution: {
      title: "Autonomous with constraints",
      description: "Agent operates freely within limits\nSmart contract enforces boundaries",
    },
  },
  {
    problem: {
      title: "Or full wallet keys with total risk",
      description: "Agent has complete access\nOne breach = everything gone",
    },
    solution: {
      title: "Breach = contained damage",
      description: "Attacker limited to daily budget\nMain wallet stays untouched",
    },
  },
  {
    problem: {
      title: "No middle ground exists",
      description: "Manual gates or total exposure\nAutonomy OR security, never both",
    },
    solution: {
      title: "On-chain enforcement",
      description: "Rules cannot be bypassed\nCryptographically guaranteed",
    },
  },
  {
    problem: {
      title: "On-chain data exposes what your agent does",
      description: "Who it belongs to\nEvery operation traced back to you",
    },
    solution: {
      title: "Privacy integration",
      description: "Optional ZK hides ownership\nOperations stay anonymous",
    },
  },
]

export function AutonomyComparison() {
  return (
    <section id="solution" className="relative py-32 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="text-sm uppercase tracking-wider text-[#8B5CF6] font-medium mb-4">
            Our solution
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground mb-5 tracking-[-0.02em]">
            From sandbox to autonomous
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            <span className="block">Most platforms force you to choose between security and autonomy.</span>
            <span className="block">Cloaked gives you both.</span>
          </p>
        </div>

        {/* Comparison Rows */}
        <div className="space-y-8">
          {comparisons.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-center"
            >
              {/* Problem Card - Left */}
              <div className="relative rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl overflow-hidden group hover:border-white/[0.08] transition-all">
                {/* Diagonal lines pattern */}
                <div className="absolute inset-0 bg-lines-pattern opacity-100" />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-background/90 via-background/50 to-background/20" />

                {/* Content */}
                <div className="relative p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center">
                        <X className="w-4 h-4 text-red-500" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <h4 className="text-base font-medium text-foreground/90">
                        {item.problem.title}
                      </h4>
                      <p className="text-sm text-muted-foreground font-light whitespace-pre-line leading-relaxed">
                        {item.problem.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden lg:flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground" />
              </div>

              {/* Solution Card - Right */}
              <div className="relative rounded-xl border border-[#10b981]/20 bg-black/40 backdrop-blur-xl overflow-hidden group hover:border-[#10b981]/30 transition-all">
                {/* Diagonal lines pattern */}
                <div className="absolute inset-0 bg-lines-pattern opacity-100" />

                {/* Gradient overlay with green tint */}
                <div className="absolute inset-0 bg-gradient-to-br from-background/90 via-background/50 to-[#10b981]/5" />

                {/* Subtle glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#10b981]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Content */}
                <div className="relative p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#10b981]" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <h4 className="text-base font-medium text-foreground">
                        {item.solution.title}
                      </h4>
                      <p className="text-sm text-muted-foreground font-light whitespace-pre-line leading-relaxed">
                        {item.solution.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
