"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import {
  DisplayCurrency,
  getGlobalDisplayCurrency,
  setGlobalDisplayCurrency as persistGlobal,
  getAgentDisplayCurrency,
  setAgentDisplayCurrency as persistAgent,
  resolveDisplayCurrency,
} from "@/lib/displayCurrency";

interface DisplayCurrencyContextType {
  globalCurrency: DisplayCurrency;
  setGlobalCurrency: (currency: DisplayCurrency) => void;
  getAgentCurrency: (agentAddress: string) => DisplayCurrency | "auto";
  setAgentCurrency: (agentAddress: string, currency: DisplayCurrency | "auto") => void;
  resolveForAgent: (agentAddress: string) => DisplayCurrency;
}

const DisplayCurrencyContext = createContext<DisplayCurrencyContextType>({
  globalCurrency: "SOL",
  setGlobalCurrency: () => {},
  getAgentCurrency: () => "auto",
  setAgentCurrency: () => {},
  resolveForAgent: () => "SOL",
});

export const useDisplayCurrency = () => useContext(DisplayCurrencyContext);

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [globalCurrency, setGlobalState] = useState<DisplayCurrency>("SOL");
  const [agentOverrides, setAgentOverrides] = useState<Record<string, DisplayCurrency | "auto">>({});

  useEffect(() => {
    setGlobalState(getGlobalDisplayCurrency());
    // Load agent overrides
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("cloak-agent-display-currency");
        if (stored) setAgentOverrides(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const setGlobalCurrency = useCallback((currency: DisplayCurrency) => {
    setGlobalState(currency);
    persistGlobal(currency);
  }, []);

  const getAgentCurrency = useCallback(
    (agentAddress: string): DisplayCurrency | "auto" => {
      return agentOverrides[agentAddress] || "auto";
    },
    [agentOverrides]
  );

  const setAgentCurrency = useCallback(
    (agentAddress: string, currency: DisplayCurrency | "auto") => {
      persistAgent(agentAddress, currency);
      setAgentOverrides((prev) => {
        const next = { ...prev };
        if (currency === "auto") {
          delete next[agentAddress];
        } else {
          next[agentAddress] = currency;
        }
        return next;
      });
    },
    []
  );

  const resolveForAgent = useCallback(
    (agentAddress: string): DisplayCurrency => {
      const agentCurrency = agentOverrides[agentAddress];
      if (agentCurrency && agentCurrency !== "auto") return agentCurrency;
      return globalCurrency;
    },
    [agentOverrides, globalCurrency]
  );

  return (
    <DisplayCurrencyContext.Provider
      value={{ globalCurrency, setGlobalCurrency, getAgentCurrency, setAgentCurrency, resolveForAgent }}
    >
      {children}
    </DisplayCurrencyContext.Provider>
  );
}
