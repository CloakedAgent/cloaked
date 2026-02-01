"use client"

import React from "react"

import { Link2, Snowflake, Users, CreditCard, Plug, ShieldCheck } from "lucide-react"

interface FeatureProps {
  icon: React.ReactNode
  title: string
  description: string
}

function Feature({ icon, title, description }: FeatureProps) {
  return (
    <div className="glass rounded-lg p-6 hover:border-white/10 transition-all duration-300 group">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-violet/10 flex items-center justify-center mb-4 group-hover:bg-violet/15 transition-colors">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-base font-normal text-foreground mb-2 tracking-[-0.01em]">{title}</h3>

      {/* Description */}
      <p className="text-muted-foreground text-sm leading-relaxed font-light">{description}</p>
    </div>
  )
}

export function FeaturesGrid() {
  const features: FeatureProps[] = [
    {
      icon: <Link2 className="h-5 w-5 text-violet" />,
      title: "On-Chain Limits",
      description: "Enforced by Solana. Agents cannot bypass even if compromised.",
    },
    {
      icon: <Snowflake className="h-5 w-5 text-violet" />,
      title: "Instant Freeze",
      description: "Stop all spending with one click. Resumes when you're ready.",
    },
    {
      icon: <Users className="h-5 w-5 text-violet" />,
      title: "Multi-Agent",
      description: "Manage dozens of agents, each with custom limits and budgets.",
    },
    {
      icon: <CreditCard className="h-5 w-5 text-violet" />,
      title: "x402 Native",
      description: "Built for the emerging AI payment standard. Works with any x402 service.",
    },
    {
      icon: <Plug className="h-5 w-5 text-violet" />,
      title: "MCP Integration",
      description: "Simple tools for AI: balance, status, pay, withdraw. Plug and play.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-violet" />,
      title: "Zero Trust",
      description: "Don't trust the agent. Don't trust the relayer. Trust the blockchain.",
    },
  ]

  return (
    null
  )
}
