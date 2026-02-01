"use client";

import { useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { DocsSidebar } from "@/components/docs";
import Link from "next/link";
import Image from "next/image";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="docs-layout">
      {/* Header */}
      <header className="docs-header">
        <div className="docs-header-inner">
          <div className="docs-header-left">
            <button
              className="docs-menu-button"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="docs-logo">
              <Image
                src="/images/cloaked-logo.png"
                alt="Cloaked"
                width={28}
                height={28}
                className="docs-logo-icon"
              />
              <span className="docs-logo-text">Cloaked</span>
            </Link>
            <span className="docs-logo-divider">/</span>
            <Link href="/docs" className="docs-logo-docs">
              Docs
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="docs-container">
        <DocsSidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        <main className="docs-main">{children}</main>
      </div>
    </div>
  );
}
