"use client";

import { useState, useCallback } from "react";
import { NETWORK } from "@/lib/constants";

interface AgentDetailsConfigProps {
  delegateId: string;
  vaultAddress: string | null;
  agentStatePdaAddress: string | null;
}

export function AgentDetailsConfig({
  delegateId,
  vaultAddress,
  agentStatePdaAddress,
}: AgentDetailsConfigProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [mcpExpanded, setMcpExpanded] = useState(false);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const mcpConfig = {
    mcpServers: {
      cloaked: {
        command: "npx",
        args: ["cloaked-mcp"],
        env: {
          CLOAKED_AGENT_KEY: "<your-agent-key>",
        },
      },
    },
  };

  const mcpConfigString = JSON.stringify(mcpConfig, null, 2);

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  const CopyableField = ({ text, label, fullText }: { text: string; label: string; fullText: string }) => (
    <button
      onClick={() => handleCopy(fullText, label)}
      className="flex-1 glass-input rounded px-3 py-2 text-[12px] font-mono text-zinc-300 truncate flex items-center hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer text-left"
      title="Click to copy"
    >
      {copied === label ? (
        <span className="text-[var(--cloak-success)] flex items-center gap-2">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </span>
      ) : (
        text
      )}
    </button>
  );

  const ExternalLink = ({ address }: { address: string }) => (
    <a
      href={`https://solscan.io/account/${address}?cluster=${NETWORK}`}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded glass-input hover:bg-[#222] transition-colors text-zinc-400 hover:text-white"
      title="View on Solscan"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );

  return (
    <div className="glass-card rounded-[8px] p-6">
      <h3 className="text-[13px] font-semibold text-white mb-5 border-b border-[#ffffff08] pb-4">
        Agent Configuration
      </h3>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column - Agent Details */}
        <div className="col-span-12 md:col-span-5">
          <div className="space-y-4">
            {/* Agent ID (Delegate) */}
            <div>
              <label className="text-[11px] font-medium text-zinc-500 block mb-1.5">Agent ID (Delegate)</label>
              <div className="flex space-x-2">
                <CopyableField text={truncateAddress(delegateId)} label="delegate" fullText={delegateId} />
                <ExternalLink address={delegateId} />
              </div>
            </div>

            {/* Vault Address */}
            {vaultAddress && (
              <div>
                <label className="text-[11px] font-medium text-zinc-500 block mb-1.5">Vault Address</label>
                <div className="flex space-x-2">
                  <CopyableField text={truncateAddress(vaultAddress)} label="vault" fullText={vaultAddress} />
                  <ExternalLink address={vaultAddress} />
                </div>
              </div>
            )}

            {/* Agent State PDA */}
            {agentStatePdaAddress && (
              <div>
                <label className="text-[11px] font-medium text-zinc-500 block mb-1.5">Agent State PDA</label>
                <div className="flex space-x-2">
                  <CopyableField text={truncateAddress(agentStatePdaAddress)} label="pda" fullText={agentStatePdaAddress} />
                  <ExternalLink address={agentStatePdaAddress} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - MCP Configuration */}
        <div className="col-span-12 md:col-span-7 flex flex-col">
          <label className="text-[11px] font-medium text-zinc-500 block mb-1.5">MCP Configuration</label>
          <div className="relative group">
            <pre
              className={`glass-input rounded-md p-3 text-[11px] font-mono text-zinc-400 overflow-y-auto w-full resize-none block transition-all ${
                mcpExpanded ? "h-auto max-h-[400px]" : "h-[140px]"
              }`}
            >
              {mcpConfigString}
            </pre>
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={() => setMcpExpanded(!mcpExpanded)}
                className="p-1.5 rounded bg-[#1a1a1a] text-zinc-500 hover:text-white border border-[#333] opacity-0 group-hover:opacity-100 transition-opacity"
                title={mcpExpanded ? "Collapse" : "Expand"}
              >
                <svg className={`w-3 h-3 transition-transform ${mcpExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => handleCopy(mcpConfigString, "mcp")}
                className="p-1.5 rounded bg-[#1a1a1a] text-zinc-500 hover:text-white border border-[#333] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy Config"
              >
                {copied === "mcp" ? (
                  <svg className="w-3 h-3 text-[var(--cloak-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 mt-2 mb-3">
            Replace <code className="text-[#22d3ee]">&lt;your-agent-key&gt;</code> with the Agent Key shown at creation
          </p>

          {/* Documentation CTAs - below MCP config */}
          <div className="flex gap-2">
            <a
              href="/docs"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded glass-input hover:bg-[#1a1a1a] transition-colors text-[11px] font-medium text-zinc-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              View Docs
            </a>
            <a
              href="/docs/sdk/installation"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded glass-input hover:bg-[#1a1a1a] transition-colors text-[11px] font-medium text-zinc-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              SDK
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
