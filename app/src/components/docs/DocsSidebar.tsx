"use client";

import { memo, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NavItem } from "@/lib/docs/types";
import { docsNavigation } from "@/lib/docs/navigation";

interface DocsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsSidebar = memo(function DocsSidebar({
  isOpen,
  onClose,
}: DocsSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="docs-sidebar-overlay" onClick={onClose} />
      )}

      <aside className={`docs-sidebar ${isOpen ? "docs-sidebar-open" : ""}`}>
        <div className="docs-sidebar-header">
          <Link href="/docs" className="docs-sidebar-title" onClick={onClose}>
            Documentation
          </Link>
        </div>

        <nav className="docs-sidebar-nav">
          {docsNavigation.map((section) => (
            <NavSection
              key={section.title}
              section={section}
              pathname={pathname}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="docs-sidebar-footer">
          <Link href="/" className="docs-back-link">
            ← Back to Cloaked
          </Link>
        </div>
      </aside>
    </>
  );
});

interface NavSectionProps {
  section: NavItem;
  pathname: string;
  onNavigate: () => void;
}

const NavSection = memo(function NavSection({
  section,
  pathname,
  onNavigate,
}: NavSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasActiveChild = section.items?.some(
    (item) => item.href === pathname
  );

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div className="docs-nav-section">
      <button
        className={`docs-nav-section-header ${hasActiveChild ? "docs-nav-section-active" : ""}`}
        onClick={toggleExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span>{section.title}</span>
      </button>

      {isExpanded && section.items && (
        <ul className="docs-nav-items">
          {section.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href!}
                className={`docs-nav-item ${pathname === item.href ? "docs-nav-item-active" : ""}`}
                onClick={onNavigate}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
