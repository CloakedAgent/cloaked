"use client";

import { useEffect, useState, memo, useMemo } from "react";
import dynamic from "next/dynamic";
import { getAllDocSlugs } from "@/lib/docs/navigation";

interface DocsContentProps {
  slug: string;
}

// Generate MDX component loaders dynamically from navigation
// This ensures navigation config is the single source of truth
function createMdxLoader(slug: string) {
  // Dynamic import with webpack magic comments for code splitting
  return dynamic(
    () =>
      import(`@/content/docs/${slug}.mdx`).catch(() =>
        // Fallback to index.mdx in directory
        import(`@/content/docs/${slug}/index.mdx`).catch(() => {
          // Return a "not found" component
          return {
            default: () => (
              <div className="docs-content-missing">
                <p>Content not found for this page.</p>
              </div>
            ),
          };
        })
      ),
    {
      loading: () => (
        <div className="docs-content-loading">
          <div className="docs-skeleton" />
          <div className="docs-skeleton" />
          <div className="docs-skeleton" />
        </div>
      ),
    }
  );
}

// Pre-generate loaders for all known slugs at module load time
// This allows webpack to statically analyze the imports
const mdxComponents: Record<string, ReturnType<typeof createMdxLoader>> = {};
getAllDocSlugs().forEach((slug) => {
  mdxComponents[slug] = createMdxLoader(slug);
});

export const DocsContent = memo(function DocsContent({ slug }: DocsContentProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get or create the MDX component for this slug
  const MDXComponent = useMemo(() => {
    if (mdxComponents[slug]) {
      return mdxComponents[slug];
    }
    // For unknown slugs, create loader on-demand
    return createMdxLoader(slug);
  }, [slug]);

  if (!mounted) {
    return (
      <div className="docs-content-loading">
        <div className="docs-skeleton" />
        <div className="docs-skeleton" />
        <div className="docs-skeleton" />
      </div>
    );
  }

  return <MDXComponent />;
});
