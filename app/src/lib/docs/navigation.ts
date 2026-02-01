import { NavItem } from "./types";

export const docsNavigation: NavItem[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", href: "/docs/introduction" },
      { title: "Why Cloaked?", href: "/docs/introduction/why-cloaked" },
      { title: "How It Works", href: "/docs/introduction/how-it-works" },
      { title: "Quick Start", href: "/docs/quickstart" },
    ],
  },
  {
    title: "Privacy",
    items: [
      { title: "Dual-Mode System", href: "/docs/privacy/dual-mode" },
      { title: "ZK Proofs", href: "/docs/privacy/zk-proofs" },
      { title: "Private Agents", href: "/docs/privacy/private-agents" },
      { title: "Privacy Cash", href: "/docs/privacy/privacy-cash" },
    ],
  },
  {
    title: "SDK",
    items: [
      { title: "Installation", href: "/docs/sdk/installation" },
      { title: "CloakedAgent", href: "/docs/sdk/cloaked-agent" },
      { title: "Methods", href: "/docs/sdk/methods" },
      { title: "Examples", href: "/docs/sdk/examples" },
    ],
  },
  {
    title: "AI Agents",
    items: [
      { title: "Setup", href: "/docs/ai-agents/setup" },
      { title: "Available Tools", href: "/docs/ai-agents/tools" },
      { title: "x402 Protocol", href: "/docs/ai-agents/x402" },
      { title: "AI Integration", href: "/docs/ai-agents/ai-integration" },
      { title: "Automation", href: "/docs/ai-agents/automation" },
    ],
  },
  {
    title: "Architecture",
    items: [
      { title: "On-Chain Program", href: "/docs/architecture/on-chain" },
      { title: "Constraint System", href: "/docs/architecture/constraints" },
      { title: "Fee Structure", href: "/docs/architecture/fees" },
    ],
  },
];

// Get all doc slugs for static generation
export function getAllDocSlugs(): string[] {
  const slugs: string[] = [];

  for (const section of docsNavigation) {
    if (section.items) {
      for (const item of section.items) {
        if (item.href) {
          slugs.push(item.href.replace("/docs/", ""));
        }
      }
    }
  }

  return slugs;
}

// Find prev/next docs for pagination
export function getPrevNext(currentSlug: string): {
  prev: NavItem | null;
  next: NavItem | null;
} {
  const flatItems: NavItem[] = [];

  for (const section of docsNavigation) {
    if (section.items) {
      flatItems.push(...section.items.filter((item) => item.href));
    }
  }

  const currentIndex = flatItems.findIndex(
    (item) => item.href === `/docs/${currentSlug}`
  );

  return {
    prev: currentIndex > 0 ? flatItems[currentIndex - 1] : null,
    next: currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null,
  };
}
