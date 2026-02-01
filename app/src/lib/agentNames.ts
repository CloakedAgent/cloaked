import { AgentIconType, DEFAULT_AGENT_ICON } from "./agentIcons";

const STORAGE_KEY = "cloak-agent-names";

interface AgentData {
  name: string;
  icon: AgentIconType;
}

interface AgentDataStore {
  [vaultAddress: string]: AgentData | string;
}

function getStoredData(): AgentDataStore {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveData(data: AgentDataStore): void {
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

export function getAgentName(vaultAddress: string): string | null {
  const data = getStoredData();
  const entry = normalizeEntry(data[vaultAddress]);
  return entry?.name || null;
}

export function getAgentIcon(vaultAddress: string): AgentIconType {
  const data = getStoredData();
  const entry = normalizeEntry(data[vaultAddress]);
  return entry?.icon || DEFAULT_AGENT_ICON;
}

export function setAgentName(vaultAddress: string, name: string): void {
  const data = getStoredData();
  const existing = normalizeEntry(data[vaultAddress]);
  data[vaultAddress] = {
    name,
    icon: existing?.icon || DEFAULT_AGENT_ICON,
  };
  saveData(data);
}

export function setAgentIcon(vaultAddress: string, icon: AgentIconType): void {
  const data = getStoredData();
  const existing = normalizeEntry(data[vaultAddress]);
  if (!existing) return;
  data[vaultAddress] = {
    name: existing.name,
    icon,
  };
  saveData(data);
}

export function setAgentData(vaultAddress: string, name: string, icon: AgentIconType): void {
  const data = getStoredData();
  data[vaultAddress] = { name, icon };
  saveData(data);
}

export function deleteAgentName(vaultAddress: string): void {
  const data = getStoredData();
  delete data[vaultAddress];
  saveData(data);
}

export function getAllAgentNames(): Record<string, string> {
  const data = getStoredData();
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const entry = normalizeEntry(value);
    if (entry) {
      result[key] = entry.name;
    }
  }
  return result;
}
