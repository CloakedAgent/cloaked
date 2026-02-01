"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components";
import { DashboardSidebar } from "@/components/dashboard";
import { useAgentTokens, usePrivateAgents } from "@/hooks";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens, loading, refresh } = useAgentTokens();
  const {
    agents: privateAgents,
    loading: privateLoading,
    hasMasterSecret,
    isSignatureRequested,
    deriveMaster,
    refresh: refreshPrivate,
  } = usePrivateAgents();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleUnlockPrivate = useCallback(() => {
    deriveMaster();
  }, [deriveMaster]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onMenuClick={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={closeSidebar}
          />
        )}
        <DashboardSidebar
          agents={tokens}
          loading={loading}
          privateAgents={hasMasterSecret ? privateAgents : []}
          privateLoading={privateLoading}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          hasMasterSecret={hasMasterSecret}
          onUnlockPrivate={handleUnlockPrivate}
          isUnlocking={isSignatureRequested}
        />
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
