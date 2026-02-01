"use client";

import { useState, useEffect } from "react";

/**
 * Hook to prevent React hydration mismatch errors.
 * Returns false during SSR and initial client render, true after hydration completes.
 * Use this to defer rendering of client-only content that depends on browser APIs,
 * localStorage, wallet state, or other values that differ between server and client.
 *
 * @example
 * function MyComponent() {
 *   const hydrated = useHydrated();
 *   if (!hydrated) return <LoadingSkeleton />;
 *   return <ClientOnlyContent />;
 * }
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
