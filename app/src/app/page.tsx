import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { DashboardPreview } from "@/components/landing/dashboard-preview"
import { CoreFeatures } from "@/components/landing/core-features"
import { ProblemSolution } from "@/components/landing/problem-solution"
import { HowItWorksNew } from "@/components/landing/how-it-works-new"
import { CodePreview } from "@/components/landing/code-preview"
import { AutonomyComparison } from "@/components/landing/autonomy-comparison"
import { ControlLayers } from "@/components/landing/control-layers"
import { PrivacyLevels } from "@/components/landing/privacy-levels"
import { FeaturesGrid } from "@/components/landing/features-grid"
import { WhyNow } from "@/components/landing/why-now"
import { WhyCloaked } from "@/components/landing/why-cloaked"
import { Roadmap } from "@/components/landing/roadmap"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-void">
      <Header />

      {/* Add padding top to account for fixed header */}
      <div className="pt-16">
        <Hero />
        <DashboardPreview />
        <CoreFeatures />
        <ProblemSolution />
        <HowItWorksNew />
        <CodePreview />
        <AutonomyComparison />
        <ControlLayers />
        <WhyCloaked />
        <Roadmap />
        <PrivacyLevels />
        <FeaturesGrid />
        <WhyNow />
        <Footer />
      </div>
    </main>
  )
}
