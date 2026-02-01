"use client"

export function WhyNow() {
  return (
    <section className="relative min-h-[70vh] flex flex-col items-center justify-center py-32 px-6 bg-black overflow-hidden">
      <div className="relative z-10 max-w-4xl mx-auto w-full">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="text-sm font-medium tracking-wider text-violet uppercase">
            Market Timing
          </span>
        </div>

        {/* Section Header */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-foreground mb-8 text-center tracking-[-0.02em]">
          The Agent Economy Is Here
        </h2>

        {/* Body */}
        <p className="text-base md:text-lg text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed font-light text-center">
          AI agents are becoming autonomous workers. They research, code, call APIs, book services. The missing piece? Secure, constrained spending.
        </p>

        {/* Problem statement */}
        <div className="relative max-w-2xl mx-auto">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-violet/50 to-transparent" />
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-violet/50 to-transparent" />
          <div className="px-8 py-6">
            <p className="text-lg text-foreground font-normal text-center mb-2">
              Agents spending autonomously, securely, and privately?
            </p>
            <p className="text-xl text-violet font-light text-center">
              That&apos;s the missing infrastructure we built.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
