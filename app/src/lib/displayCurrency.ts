const GLOBAL_KEY = "cloak-display-currency";
const AGENT_KEY = "cloak-agent-display-currency";

export type DisplayCurrency = "SOL" | string; // string = mint address for token mode

export function getGlobalDisplayCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "SOL";
  try {
    return localStorage.getItem(GLOBAL_KEY) || "SOL";
  } catch {
    return "SOL";
  }
}

export function setGlobalDisplayCurrency(currency: DisplayCurrency): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GLOBAL_KEY, currency);
  } catch {
    // localStorage might be full or disabled
  }
}

function getAgentOverrides(): Record<string, DisplayCurrency | "auto"> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(AGENT_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAgentOverrides(data: Record<string, DisplayCurrency | "auto">): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AGENT_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or disabled
  }
}

export function getAgentDisplayCurrency(agentAddress: string): DisplayCurrency | "auto" {
  const overrides = getAgentOverrides();
  return overrides[agentAddress] || "auto";
}

export function setAgentDisplayCurrency(agentAddress: string, currency: DisplayCurrency | "auto"): void {
  const overrides = getAgentOverrides();
  if (currency === "auto") {
    delete overrides[agentAddress];
  } else {
    overrides[agentAddress] = currency;
  }
  saveAgentOverrides(overrides);
}

export function resolveDisplayCurrency(agentAddress: string): DisplayCurrency {
  const agentCurrency = getAgentDisplayCurrency(agentAddress);
  if (agentCurrency !== "auto") return agentCurrency;
  return getGlobalDisplayCurrency();
}
