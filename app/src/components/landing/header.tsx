"use client"

import Link from "next/link"
import Image from "next/image"
import { MovingBorderButton } from "@/components/ui/moving-border-button"

export function Header() {
  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault()
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4">
      {/* Floating container like Raycast */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between h-14 px-5 rounded-xl bg-black/70 backdrop-blur-xl border border-white/[0.08]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/cloaked-logo.png"
              alt="Cloaked Logo"
              width={36}
              height={36}
              className="w-9 h-9"
            />
            <span className="font-medium text-foreground text-lg">Cloaked</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, "features")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, "how-it-works")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              How it Works
            </a>
            <a
              href="#integration"
              onClick={(e) => scrollToSection(e, "integration")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Integration
            </a>
            <a
              href="#solution"
              onClick={(e) => scrollToSection(e, "solution")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Solution
            </a>
            <a
              href="#roadmap"
              onClick={(e) => scrollToSection(e, "roadmap")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Roadmap
            </a>
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <MovingBorderButton
                borderRadius="0.75rem"
                duration={5000}
                containerClassName="h-9 w-auto"
                borderClassName="bg-[radial-gradient(#8B5CF6_40%,transparent_60%)]"
                className="bg-black border-violet/60 text-white text-sm font-medium px-6"
              >
                Launch App
              </MovingBorderButton>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
