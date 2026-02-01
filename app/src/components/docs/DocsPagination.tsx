"use client";

import { memo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavItem } from "@/lib/docs/types";

interface DocsPaginationProps {
  prev: NavItem | null;
  next: NavItem | null;
}

export const DocsPagination = memo(function DocsPagination({
  prev,
  next,
}: DocsPaginationProps) {
  return (
    <nav className="docs-pagination">
      {prev ? (
        <Link href={prev.href!} className="docs-pagination-link docs-pagination-prev">
          <ChevronLeft className="w-4 h-4" />
          <div>
            <span className="docs-pagination-label">Previous</span>
            <span className="docs-pagination-title">{prev.title}</span>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link href={next.href!} className="docs-pagination-link docs-pagination-next">
          <div>
            <span className="docs-pagination-label">Next</span>
            <span className="docs-pagination-title">{next.title}</span>
          </div>
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
});
