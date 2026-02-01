"use client"

import { useEffect, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { LogoCloud } from "@/components/ui/logo-cloud"

const terminalLines = [
  { text: "$ npm install @cloakedagent/sdk", type: "command", delay: 2 },
  { text: "✓ Installing Cloaked SDK...", type: "success", delay: 3 },
  { text: "✓ Configuring MCP server.", type: "success", delay: 3 },
  { text: "✓ Setting up agent wallet connector.", type: "success", delay: 3 },
  { text: "✓ Initializing x402 payment layer.", type: "success", delay: 3 },
  { text: "✓ Connecting to Solana mainnet.", type: "success", delay: 3 },
  { text: "i Agent configuration:", type: "info", delay: 2 },
  { text: "  - maxPerTx: 10 SOL", type: "config", delay: 1 },
  { text: "  - dailyLimit: 100 SOL", type: "config", delay: 1 },
  { text: "  - mcp: ready", type: "config", delay: 1 },
  { text: "Success! Agent ready for autonomous transactions.", type: "final", delay: 2 },
  { text: "Run your agent with the SDK.", type: "hint", delay: 2 },
]

function LoopingTerminal() {
  const [lines, setLines] = useState<{ text: string; type: string }[]>([])
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(true)

  const resetAnimation = useCallback(() => {
    setLines([])
    setCurrentLineIndex(0)
    setCurrentCharIndex(0)
    setIsTyping(true)
  }, [])

  useEffect(() => {
    if (currentLineIndex >= terminalLines.length) {
      // Wait 3 seconds then reset and loop
      const resetTimer = setTimeout(() => {
        resetAnimation()
      }, 3000)
      return () => clearTimeout(resetTimer)
    }

    const currentLine = terminalLines[currentLineIndex]

    if (currentCharIndex < currentLine.text.length) {
      // Type character by character
      const typingTimer = setTimeout(() => {
        setCurrentCharIndex(prev => prev + 1)
      }, currentLine.delay)
      return () => clearTimeout(typingTimer)
    } else {
      // Line complete, add to lines array and move to next
      const lineCompleteTimer = setTimeout(() => {
        setLines(prev => [...prev, { text: currentLine.text, type: currentLine.type }])
        setCurrentLineIndex(prev => prev + 1)
        setCurrentCharIndex(0)
      }, 5)
      return () => clearTimeout(lineCompleteTimer)
    }
  }, [currentLineIndex, currentCharIndex, resetAnimation])

  const currentLine = terminalLines[currentLineIndex]
  const typingText = currentLine ? currentLine.text.substring(0, currentCharIndex) : ""

  const getLineColor = (type: string) => {
    switch (type) {
      case "success": return "text-[#10b981]"
      case "info": return "text-[#8B5CF6]"
      case "config": return "text-muted-foreground"
      case "final": return "text-white font-medium"
      case "hint": return "text-muted-foreground"
      default: return "text-white/90"
    }
  }

  return (
    <div className="w-full rounded-lg border border-white/[0.08] bg-black/60 backdrop-blur-xl">
      {/* Window Header with traffic lights */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
      </div>
      {/* Terminal Content */}
      <div className="p-6 font-mono text-sm space-y-1.5 min-h-[380px]">
        {/* Completed lines */}
        {lines.map((line, index) => (
          <div key={index} className={getLineColor(line.type)}>
            {line.text}
          </div>
        ))}

        {/* Currently typing line */}
        {currentLineIndex < terminalLines.length && (
          <div className={cn(getLineColor(currentLine?.type || "command"), "flex items-center")}>
            <span>{typingText}</span>
            <span className="inline-block w-2 h-4 bg-[#10b981] ml-0.5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  )
}

export function CodePreview() {
  return (
    <section id="integration" className="relative py-32 px-6 pattern-grid">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <p className="text-[#8B5CF6] text-sm font-medium tracking-wider uppercase mb-4">
            Developer Experience
          </p>
          <h2 className="text-3xl md:text-4xl font-light text-foreground mb-5 tracking-[-0.02em]">
            Simple to integrate
          </h2>
          <p className="text-base text-muted-foreground max-w-lg mx-auto font-light">
            Native integration with emerging AI standards. Direct SDK for custom implementations. Built for the autonomous agent economy.
          </p>
        </div>

        {/* Looping Terminal Animation */}
        <LoopingTerminal />

        {/* Partner/Integration Logos - Animated Slider */}
        <LogoCloud
          className="mt-12"
          speed={18}
          logos={[
            {
              src: "/images/1.png",
              alt: "Solana",
              height: 72,
            },
            {
              src: "/images/2.png",
              alt: "x402",
              height: 72,
            },
            {
              src: "/images/3.png",
              alt: "Helius",
              height: 56,
              opacity: 0.4,
            },
            {
              src: "/images/4.png",
              alt: "Noir",
              height: 72,
            },
            {
              src: "/images/5.png",
              alt: "Anchor",
              height: 72,
            },
            {
              src: "/images/6.png",
              alt: "Rust",
              height: 72,
            },
            {
              src: "/images/7.png",
              alt: "TypeScript",
              height: 72,
            },
          ]}
        />
      </div>
    </section>
  )
}
