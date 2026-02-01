"use client";

import { memo } from "react";
import Link from "next/link";
import { PRIVACY_CASH_DEMO } from "@/lib/constants";

interface DemoTipboxProps {
  className?: string;
  compact?: boolean;
}

export const DemoTipbox = memo(function DemoTipbox({
  className = "",
  compact = false
}: DemoTipboxProps) {
  return (
    <div className={`bg-[var(--cloak-warning)]/10 border border-[var(--cloak-warning)]/30 rounded-lg p-4 ${className}`}>
      <div className="flex gap-3">
        <svg
          className="w-5 h-5 text-[var(--cloak-warning)] flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="text-sm">
          <p className="text-[var(--cloak-warning)]">
            {compact ? PRIVACY_CASH_DEMO.MESSAGE_SHORT : PRIVACY_CASH_DEMO.MESSAGE}
          </p>
          <Link
            href={PRIVACY_CASH_DEMO.DOCS_URL}
            className="text-[var(--cloak-warning)]/80 hover:text-[var(--cloak-warning)] underline mt-1 inline-block"
          >
            Learn more →
          </Link>
        </div>
      </div>
    </div>
  );
});
