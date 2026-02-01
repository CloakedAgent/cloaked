"use client"

const features = [
  {
    title: "Spending Limits",
    bullets: ["Per-tx maximum", "Daily spending budget", "Lifetime usage cap"],
    highlight: "On-chain automation",
    detail: "Fully enforced",
    accentColor: "#8B5CF6", // purple
  },
  {
    title: "Key Isolation",
    bullets: ["Breach contained", "Separate accounts", "Cryptographic boundaries"],
    highlight: "Never touches main wallet",
    detail: "Instant setup",
    accentColor: "#10b981", // green
  },
  {
    title: "ZK Privacy",
    bullets: ["Hidden ownership", "Unlinkable ops", "Zero-knowledge proofs"],
    highlight: "No on-chain trace",
    detail: "Full anonymity",
    accentColor: "#8B5CF6", // purple
  },
]

// Custom icon components for more interesting visuals
function SpendingLimitIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stacked cards/layers effect */}
      <rect x="14" y="24" width="40" height="28" rx="4" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" />
      <rect x="20" y="18" width="40" height="28" rx="4" stroke="white" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x="26" y="12" width="40" height="28" rx="4" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" fill="rgba(139, 92, 246, 0.05)" />
      {/* Limit bar */}
      <rect x="32" y="22" width="28" height="4" rx="2" fill="rgba(139, 92, 246, 0.3)" />
      <rect x="32" y="22" width="16" height="4" rx="2" fill="#8B5CF6" />
      {/* Dollar sign accent */}
      <circle cx="58" cy="52" r="12" stroke="#8B5CF6" strokeWidth="1.5" fill="rgba(139, 92, 246, 0.1)" />
      <text x="58" y="57" textAnchor="middle" fill="#8B5CF6" fontSize="14" fontWeight="500">$</text>
    </svg>
  )
}

function KeyIsolationIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main vault/container */}
      <rect x="16" y="20" width="48" height="40" rx="6" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Divider lines creating isolated sections */}
      <line x1="32" y1="20" x2="32" y2="60" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
      <line x1="48" y1="20" x2="48" y2="60" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
      {/* Keys in separate sections */}
      <circle cx="24" cy="40" r="4" stroke="#10b981" strokeWidth="1.5" fill="rgba(16, 185, 129, 0.15)" />
      <line x1="24" y1="44" x2="24" y2="52" stroke="#10b981" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="4" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="40" y1="44" x2="40" y2="52" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="56" cy="40" r="4" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      <line x1="56" y1="44" x2="56" y2="52" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Lock indicator */}
      <rect x="34" y="12" width="12" height="10" rx="2" stroke="#10b981" strokeWidth="1.5" fill="rgba(16, 185, 129, 0.1)" />
      <circle cx="40" cy="17" r="1.5" fill="#10b981" />
    </svg>
  )
}

function ZkPrivacyIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Eye outline */}
      <path d="M12 40C12 40 24 24 40 24C56 24 68 40 68 40C68 40 56 56 40 56C24 56 12 40 12 40Z" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
      {/* Pupil with privacy shield */}
      <circle cx="40" cy="40" r="10" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="4" fill="#8B5CF6" fillOpacity="0.6" />
      {/* ZK proof lines - crossing out / hidden */}
      <line x1="28" y1="28" x2="52" y2="52" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="28" x2="28" y2="52" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      {/* Zero knowledge badge */}
      <rect x="52" y="54" width="20" height="12" rx="3" fill="rgba(139, 92, 246, 0.15)" stroke="#8B5CF6" strokeWidth="1" />
      <text x="62" y="63" textAnchor="middle" fill="#8B5CF6" fontSize="8" fontWeight="600">ZK</text>
    </svg>
  )
}

const iconComponents = [SpendingLimitIcon, KeyIsolationIcon, ZkPrivacyIcon]

export function CoreFeatures() {
  return (
    <section id="features" className="relative py-32 px-6 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Header - Two column layout like Linear */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-16">
          {/* Left - Section label and headline */}
          <div>
            <span className="text-sm font-medium tracking-wider text-[#8B5CF6] uppercase mb-4 block">
              Core Features
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground leading-[1.1] tracking-[-0.02em]">
              <span className="block whitespace-nowrap">Control your agents</span>
              <span className="block">completely</span>
            </h2>
          </div>

          {/* Right - Description paragraph closer to headline */}
          <p className="text-base md:text-lg text-muted-foreground max-w-sm leading-relaxed font-light lg:pt-8">
            Three layers of protection that work together. Set hard limits, isolate keys, and add privacy. Each feature strengthens the others.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature, index) => {
            const IconComponent = iconComponents[index]
            return (
              <div
                key={feature.title}
                className="group relative bg-black/50 backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden transition-all hover:border-white/[0.12]"
              >
                {/* Card content area */}
                <div className="p-6 h-full flex flex-col">
                  {/* Top illustration/icon area */}
                  <div className="flex-1 flex items-center justify-center py-10 mb-6">
                    <IconComponent />
                  </div>

                  {/* Divider with accent */}
                  <div className="h-px bg-white/[0.1] mb-6 relative">
                    <div
                      className="absolute left-0 top-0 h-full w-24"
                      style={{ background: `linear-gradient(to right, ${feature.accentColor}, transparent)` }}
                    />
                  </div>

                  {/* Bottom content */}
                  <div className="space-y-4">
                    {/* Title with accent dot */}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: feature.accentColor }}
                      />
                      <h3 className="text-xl font-medium text-foreground">
                        {feature.title}
                      </h3>
                    </div>

                    {/* Bullet points */}
                    <p className="text-sm text-muted-foreground font-light">
                      {feature.bullets.join(" • ")}
                    </p>

                    {/* Highlight and detail */}
                    <div className="flex items-center justify-between pt-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: feature.accentColor }}
                      >
                        {feature.highlight}
                      </span>
                      <span className="text-sm text-muted-foreground font-light">
                        {feature.detail}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
