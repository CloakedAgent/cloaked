"use client"

const controlLayers = [
  {
    title: "Secure Environment",
    stack: "Limits + Isolation",
    bullets: ["VPS-hosted agents", "Contained breach damage", "Daily transaction enforcement"],
    accentColor: "#8B5CF6",
  },
  {
    title: "Private Agents",
    stack: "Privacy Cash + ZK",
    bullets: ["Hidden ownership", "Unlinkable transactions", "Private operations"],
    accentColor: "#10b981",
  },
  {
    title: "Autonomous Fleet",
    stack: "Full Control + x402",
    bullets: ["Multi-agent management", "API cost control", "Development Agents"],
    accentColor: "#8B5CF6",
  },
]

// Wallet isolation icon (MAIN/AGENT) - Enlarged
function WalletIsolationIcon() {
  return (
    <svg width="200" height="200" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* MAIN Wallet */}
      <rect x="10" y="30" width="35" height="25" rx="3" stroke="#8B5CF6" strokeWidth="2" fill="rgba(139, 92, 246, 0.08)" />
      <rect x="14" y="34" width="12" height="8" rx="1.5" fill="#8B5CF6" fillOpacity="0.4" />
      <circle cx="37" cy="42.5" r="4" stroke="#8B5CF6" strokeWidth="2" fill="none" />
      <text x="27.5" y="70" fontSize="7" fill="white" fillOpacity="0.5" fontFamily="monospace" textAnchor="middle">
        MAIN
      </text>

      {/* Vertical Separator Line */}
      <line x1="70" y1="25" x2="70" y2="65" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />

      {/* AGENT Wallet */}
      <rect x="95" y="30" width="35" height="25" rx="3" stroke="#10b981" strokeWidth="2" fill="rgba(16, 185, 129, 0.08)" />
      <rect x="99" y="34" width="12" height="8" rx="1.5" fill="#10b981" fillOpacity="0.4" />
      <circle cx="122" cy="42.5" r="4" stroke="#10b981" strokeWidth="2" fill="none" />
      <text x="112.5" y="70" fontSize="7" fill="white" fillOpacity="0.5" fontFamily="monospace" textAnchor="middle">
        AGENT
      </text>
    </svg>
  )
}

// Shield with layers icon
function ShieldLayersIcon() {
  return (
    <svg width="140" height="140" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer shield */}
      <path
        d="M50 10L15 25V50C15 72 32 88 50 95C68 88 85 72 85 50V25L50 10Z"
        stroke="#10b981"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Middle shield layer */}
      <path
        d="M50 20L25 32V50C25 67 38 80 50 85C62 80 75 67 75 50V32L50 20Z"
        stroke="#10b981"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        fill="rgba(16, 185, 129, 0.05)"
      />
      {/* Inner shield */}
      <path
        d="M50 30L35 39V50C35 62 43 72 50 75C57 72 65 62 65 50V39L50 30Z"
        stroke="#10b981"
        strokeWidth="2"
        fill="rgba(16, 185, 129, 0.1)"
      />
      {/* Check mark */}
      <path d="M42 50L47 55L58 44" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Enterprise fleet/dashboard icon
function EnterpriseFleetIcon() {
  return (
    <svg width="140" height="140" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main dashboard frame */}
      <rect x="15" y="20" width="70" height="50" rx="4" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />

      {/* Header bar */}
      <rect x="15" y="20" width="70" height="10" rx="4" fill="rgba(139, 92, 246, 0.1)" />
      <circle cx="22" cy="25" r="2" fill="#8B5CF6" fillOpacity="0.6" />
      <circle cx="30" cy="25" r="2" fill="white" fillOpacity="0.2" />
      <circle cx="38" cy="25" r="2" fill="white" fillOpacity="0.2" />

      {/* Grid of agent cards */}
      <rect x="20" y="35" width="18" height="12" rx="2" stroke="#8B5CF6" strokeWidth="1" fill="rgba(139, 92, 246, 0.1)" />
      <circle cx="25" cy="41" r="2" fill="#8B5CF6" />

      <rect x="41" y="35" width="18" height="12" rx="2" stroke="#10b981" strokeOpacity="0.6" strokeWidth="1" fill="rgba(16, 185, 129, 0.05)" />
      <circle cx="46" cy="41" r="2" fill="#10b981" fillOpacity="0.6" />

      <rect x="62" y="35" width="18" height="12" rx="2" stroke="white" strokeOpacity="0.2" strokeWidth="1" fill="none" />
      <circle cx="67" cy="41" r="2" fill="white" fillOpacity="0.3" />

      {/* Status bar at bottom */}
      <rect x="20" y="52" width="60" height="4" rx="2" fill="rgba(255, 255, 255, 0.1)" />
      <rect x="20" y="52" width="40" height="4" rx="2" fill="rgba(139, 92, 246, 0.4)" />
      <rect x="20" y="52" width="20" height="4" rx="2" fill="#8B5CF6" />

      {/* Connecting lines to represent fleet */}
      <line x1="50" y1="70" x2="30" y2="85" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
      <line x1="50" y1="70" x2="50" y2="88" stroke="white" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="50" y1="70" x2="70" y2="85" stroke="white" strokeOpacity="0.15" strokeWidth="1" />

      {/* Fleet nodes */}
      <circle cx="30" cy="88" r="4" stroke="#8B5CF6" strokeOpacity="0.5" strokeWidth="1" fill="rgba(139, 92, 246, 0.1)" />
      <circle cx="50" cy="92" r="4" stroke="#8B5CF6" strokeWidth="1.5" fill="rgba(139, 92, 246, 0.2)" />
      <circle cx="70" cy="88" r="4" stroke="#8B5CF6" strokeOpacity="0.5" strokeWidth="1" fill="rgba(139, 92, 246, 0.1)" />
    </svg>
  )
}

const iconComponents = [WalletIsolationIcon, ShieldLayersIcon, EnterpriseFleetIcon]

export function ControlLayers() {
  return (
    <section id="platform" className="relative py-32 px-6 pattern-grid">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="text-sm font-medium tracking-wider text-[#8B5CF6] uppercase mb-4 block">
            Platform
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground mb-5 tracking-[-0.02em]">
            Built for real Agent workflows
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
            <span className="block">Agent isolation, payment controls, and automation at any scale.</span>
            <span className="block">One agent or hundreds.</span>
          </p>
        </div>

        {/* Cards Grid - 2 up top, 1 wide below */}
        <div className="space-y-6">
          {/* Top Row - 2 Cards Side by Side with Horizontal Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {controlLayers.slice(0, 2).map((layer, index) => {
              const IconComponent = iconComponents[index]
              return (
                <div
                  key={layer.title}
                  className="group relative bg-black/40 backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden transition-all hover:border-white/[0.15] hover:bg-black/50"
                >
                  {/* Corner brackets */}
                  <div className="absolute top-3 left-3 w-4 h-4 border-l border-t border-white/20" />
                  <div className="absolute top-3 right-3 w-4 h-4 border-r border-t border-white/20" />
                  <div className="absolute bottom-3 left-3 w-4 h-4 border-l border-b border-white/20" />
                  <div className="absolute bottom-3 right-3 w-4 h-4 border-r border-b border-white/20" />

                  <div className="p-6 flex items-center gap-6">
                    {/* Content on Left */}
                    <div className="flex-1 space-y-3">
                      {/* Title */}
                      <h3 className="text-lg font-medium text-foreground">
                        {layer.title}
                      </h3>

                      {/* Stack badge */}
                      <div
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${layer.accentColor}15`,
                          color: layer.accentColor,
                          border: `1px solid ${layer.accentColor}30`
                        }}
                      >
                        {layer.stack}
                      </div>

                      {/* Bullet points */}
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Perfect for:</p>
                        {layer.bullets.map((bullet, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div
                              className="w-1 h-1 rounded-full"
                              style={{ backgroundColor: layer.accentColor }}
                            />
                            {bullet}
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      <button
                        className="mt-3 text-xs font-medium flex items-center gap-1 transition-colors"
                        style={{ color: layer.accentColor }}
                      >
                        Click to explore
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>

                    {/* Icon on Right */}
                    <div className="flex-shrink-0">
                      <IconComponent />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom Row - 1 Wide Landscape Card */}
          {controlLayers.slice(2).map((layer, index) => {
            const IconComponent = iconComponents[2]
            return (
              <div
                key={layer.title}
                className="group relative bg-black/40 backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden transition-all hover:border-white/[0.15] hover:bg-black/50"
              >
                {/* Corner brackets */}
                <div className="absolute top-3 left-3 w-4 h-4 border-l border-t border-white/20" />
                <div className="absolute top-3 right-3 w-4 h-4 border-r border-t border-white/20" />
                <div className="absolute bottom-3 left-3 w-4 h-4 border-l border-b border-white/20" />
                <div className="absolute bottom-3 right-3 w-4 h-4 border-r border-b border-white/20" />

                <div className="p-6 flex items-center gap-6">
                  {/* Content on Left */}
                  <div className="flex-1 space-y-3">
                    {/* Title */}
                    <h3 className="text-lg font-medium text-foreground">
                      {layer.title}
                    </h3>

                    {/* Stack badge */}
                    <div
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${layer.accentColor}15`,
                        color: layer.accentColor,
                        border: `1px solid ${layer.accentColor}30`
                      }}
                    >
                      {layer.stack}
                    </div>

                    {/* Bullet points - horizontal layout */}
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Perfect for:</p>
                      <div className="flex flex-wrap gap-4">
                        {layer.bullets.map((bullet, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div
                              className="w-1 h-1 rounded-full"
                              style={{ backgroundColor: layer.accentColor }}
                            />
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA */}
                    <button
                      className="mt-3 text-xs font-medium flex items-center gap-1 transition-colors"
                      style={{ color: layer.accentColor }}
                    >
                      Click to explore
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* Icon on Right */}
                  <div className="flex-shrink-0">
                    <IconComponent />
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
