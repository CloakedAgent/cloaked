"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { AgentIconType, DEFAULT_AGENT_ICON } from "@/lib/agentIcons";

const STORAGE_KEY = "cloak-agent-names";

interface AgentData {
  name: string;
  icon: AgentIconType;
}

interface AgentDataStore {
  [vaultAddress: string]: AgentData | string; // string for backward compat
}

interface AgentNamesContextType {
  getName: (vaultAddress: string) => string | null;
  getIcon: (vaultAddress: string) => AgentIconType;
  setName: (vaultAddress: string, name: string) => void;
  setIcon: (vaultAddress: string, icon: AgentIconType) => void;
  setAgentData: (vaultAddress: string, name: string, icon: AgentIconType) => void;
  deleteName: (vaultAddress: string) => void;
}

const AgentNamesContext = createContext<AgentNamesContextType>({
  getName: () => null,
  getIcon: () => DEFAULT_AGENT_ICON,
  setName: () => {},
  setIcon: () => {},
  setAgentData: () => {},
  deleteName: () => {},
});

export const useAgentNames = () => useContext(AgentNamesContext);

function loadFromStorage(): AgentDataStore {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveToStorage(data: AgentDataStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or disabled
  }
}

function normalizeEntry(entry: AgentData | string | undefined): AgentData | null {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { name: entry, icon: DEFAULT_AGENT_ICON };
  }
  return entry;
}

export function AgentNamesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AgentDataStore>({});

  // Load from localStorage on mount
  useEffect(() => {
    setData(loadFromStorage());
  }, []);

  const getName = useCallback(
    (vaultAddress: string): string | null => {
      const entry = normalizeEntry(data[vaultAddress]);
      return entry?.name || null;
    },
    [data]
  );

  const getIcon = useCallback(
    (vaultAddress: string): AgentIconType => {
      const entry = normalizeEntry(data[vaultAddress]);
      return entry?.icon || DEFAULT_AGENT_ICON;
    },
    [data]
  );

  const setName = useCallback((vaultAddress: string, name: string) => {
    setData((prev) => {
      const existing = normalizeEntry(prev[vaultAddress]);
      const updated: AgentDataStore = {
        ...prev,
        [vaultAddress]: {
          name,
          icon: existing?.icon || DEFAULT_AGENT_ICON,
        },
      };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const setIcon = useCallback((vaultAddress: string, icon: AgentIconType) => {
    setData((prev) => {
      const existing = normalizeEntry(prev[vaultAddress]);
      const updated: AgentDataStore = {
        ...prev,
        [vaultAddress]: {
          name: existing?.name || "",
          icon,
        },
      };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const setAgentData = useCallback((vaultAddress: string, name: string, icon: AgentIconType) => {
    setData((prev) => {
      const updated: AgentDataStore = {
        ...prev,
        [vaultAddress]: { name, icon },
      };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const deleteName = useCallback((vaultAddress: string) => {
    setData((prev) => {
      const updated = { ...prev };
      delete updated[vaultAddress];
      saveToStorage(updated);
      return updated;
    });
  }, []);

  return (
    <AgentNamesContext.Provider value={{ getName, getIcon, setName, setIcon, setAgentData, deleteName }}>
      {children}
    </AgentNamesContext.Provider>
  );
}
