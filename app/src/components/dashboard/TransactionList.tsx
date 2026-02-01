"use client";

import { useAgentTransactions, AgentTransaction } from "@/hooks/useAgentTransactions";
import { NETWORK } from "@/lib/constants";

interface Props {
  delegateId: string;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || "Unknown";
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

function getExplorerUrl(signature: string): string {
  const cluster = NETWORK === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/tx/${signature}${cluster}`;
}

const SpendIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
  </svg>
);

const FundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
  </svg>
);

function TransactionRow({ tx }: { tx: AgentTransaction }) {
  const isSpend = tx.type === "spend";

  return (
    <div className="flex items-center justify-between p-4 bg-[#0a0a0a]/40 hover:bg-[#0a0a0a]/80 border border-[#1a1a1a] rounded-md transition-colors group">
      <div className="flex items-center space-x-4">
        <div
          className={`w-10 h-10 rounded-md bg-[#050505] border border-[#1a1a1a] flex items-center justify-center transition-colors ${
            isSpend
              ? "text-zinc-500 group-hover:border-violet-500/30 group-hover:text-violet-400"
              : "text-[#10b981] group-hover:border-green-500/30"
          }`}
        >
          {isSpend ? <SpendIcon /> : <FundIcon />}
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <div className="text-[13px] font-semibold text-white">
              {isSpend ? "Spend" : "Funded"}
            </div>
            <span className="px-1.5 py-0.5 rounded-[3px] bg-green-500/10 border border-green-500/20 text-[9px] font-bold text-green-500 tracking-wide uppercase">
              {tx.status}
            </span>
          </div>
          <div className="flex items-center space-x-2 mt-0.5">
            <div className="text-[11px] text-zinc-500">{formatRelativeTime(tx.timestamp)}</div>
            <span className="text-zinc-700 text-[10px]">•</span>
            <div className="text-[11px] text-zinc-600 font-mono">
              {isSpend ? "To:" : "From:"} {truncateAddress(tx.address)}
            </div>
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-[13px] font-mono mb-0.5 ${
            isSpend ? "text-zinc-300" : "font-bold text-[#10b981]"
          }`}
        >
          {isSpend ? "-" : "+"}{tx.amount.toFixed(4)} SOL
        </div>
        <a
          href={getExplorerUrl(tx.signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-violet-500 hover:text-violet-400 flex items-center justify-end space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span>View on Explorer</span>
          <svg className="w-[10px] h-[10px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-[#0a0a0a]/40 border border-[#1a1a1a] rounded-md animate-pulse">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-md bg-[#1a1a1a]" />
            <div>
              <div className="w-16 h-4 bg-[#1a1a1a] rounded mb-2" />
              <div className="w-32 h-3 bg-[#1a1a1a] rounded" />
            </div>
          </div>
          <div className="w-20 h-4 bg-[#1a1a1a] rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="text-[13px] text-zinc-500">No transactions yet</p>
      <p className="text-[11px] text-zinc-600 mt-1">Transactions will appear here once the agent starts spending</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-[13px] text-zinc-500">Failed to load transactions</p>
      <p className="text-[11px] text-zinc-600 mt-1 mb-3">{error.message}</p>
      <button
        onClick={onRetry}
        className="text-[11px] text-violet-500 hover:text-violet-400 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export function TransactionList({ delegateId }: Props) {
  const { transactions, isLoading, error, refetch } = useAgentTransactions(delegateId);

  return (
    <div className="glass-card rounded-[8px] p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          Recent Transactions
        </h2>
        <button
          onClick={refetch}
          disabled={isLoading}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-[#1a1a1a] hover:bg-[#111] hover:border-[#333] transition-all text-zinc-400 hover:text-white disabled:opacity-50"
        >
          <svg className={`w-[14px] h-[14px] ${isLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-[11px] font-medium">Refresh</span>
        </button>
      </div>

      {isLoading && transactions.length === 0 ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : transactions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto">
          {transactions.map((tx) => (
            <TransactionRow key={tx.signature} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
