"use client"

import React from "react"

import { Eye, EyeOff, ShieldOff, Plus } from "lucide-react"

interface PrivacyTierProps {
  icon: React.ReactNode
  title: string
  description: string
  features: string[]
  highlighted?: boolean
}

function PrivacyTier({ icon, title, description, features, highlighted }: PrivacyTierProps) {
  return (
    <div
      className={`
        rounded-lg p-8 h-full flex flex-col relative overflow-hidden
        ${highlighted ? "glass-strong border-violet/20" : "glass"}
      `}
    >
      {/* Glow effect for highlighted tier */}
      {highlighted && (
        <div className="absolute inset-0 bg-gradient-to-b from-violet/5 to-transparent" />
      )}

      <div className="relative">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-5 ${highlighted ? "bg-violet/20" : "bg-violet/10"}`}>
          {icon}
        </div>

        {/* Title */}
        <h3 className="text-lg font-normal text-foreground mb-2 tracking-[-0.01em]">{title}</h3>

        {/* Description */}
        <p className="text-muted-foreground text-sm leading-relaxed mb-5 font-light">{description}</p>

        {/* Features */}
        <ul className="space-y-2 mt-auto">
          {features.map((feature) => (
            <li key={feature} className="text-sm text-text-secondary flex items-start gap-2 font-light">
              <span className="text-violet mt-0.5">+</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function PrivacyLevels() {
  const tiers: PrivacyTierProps[] = [
    {
      icon: <Eye className="h-5 w-5 text-violet" />,
      title: "Standard",
      description: "Your wallet address linked on-chain. Simple, straightforward, fast.",
      features: ["Public ownership", "Basic spending limits", "Instant setup"],
    },
    {
      icon: <EyeOff className="h-5 w-5 text-violet" />,
      title: "Private Funding",
      description: "ZK deposits hide who funded the agent. No trace from wallet to agent.",
      features: ["Hidden funding source", "Unlinkable deposits", "Zero-knowledge proofs"],
    },
    {
      icon: <ShieldOff className="h-5 w-5 text-violet" />,
      title: "Full Privacy",
      description: "Zero-knowledge proofs hide ownership. No on-chain link between you and your agents.",
      features: ["Hidden ownership", "Complete anonymity", "Maximum protection"],
      highlighted: true,
    },
  ]

  return (
    null
  )
}
