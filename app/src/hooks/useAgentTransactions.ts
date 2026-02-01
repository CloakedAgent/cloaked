"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { CLOAKED_PROGRAM_ID } from "@/lib/constants";

export interface AgentTransaction {
  signature: string;
  type: "spend" | "fund";
  amount: number; // in SOL
  address: string; // destination (spend) or source (fund)
  timestamp: Date;
  status: "confirmed" | "finalized";
}

// Cache for transaction data
const txCache = new Map<string, { transactions: AgentTransaction[]; timestamp: number }>();
const CACHE_TTL = 90000; // 90 seconds (refresh button bypasses cache)

// Retry wrapper with exponential backoff for RPC rate limits
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRateLimited =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("Too many requests"));

      if (attempt === maxRetries - 1 || !isRateLimited) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries reached");
}

export function useAgentTransactions(delegateId: string | null) {
  const { connection } = useConnection();
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTransactions = useCallback(async (skipCache = false) => {
    if (!delegateId) {
      setTransactions([]);
      return;
    }

    // Derive vault PDA
    let vaultPda: PublicKey;
    try {
      const delegatePubkey = new PublicKey(delegateId);
      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegatePubkey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
    } catch {
      setError(new Error("Invalid delegate ID"));
      return;
    }

    const cacheKey = vaultPda.toBase58();

    // Check cache
    if (!skipCache) {
      const cached = txCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setTransactions(cached.transactions);
        return;
      }
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      // Fetch recent signatures for the vault (reduced from 15 to avoid rate limits)
      const signatures = await withRetry(() =>
        connection.getSignaturesForAddress(vaultPda, { limit: 8 })
      );

      if (signatures.length === 0) {
        setTransactions([]);
        txCache.set(cacheKey, { transactions: [], timestamp: Date.now() });
        return;
      }

      // Fetch parsed transactions with retry
      const parsedTxs = await withRetry(() =>
        connection.getParsedTransactions(
          signatures.map((s) => s.signature),
          { maxSupportedTransactionVersion: 0 }
        )
      );

      const vaultAddress = vaultPda.toBase58();
      const parsed: AgentTransaction[] = [];

      for (let i = 0; i < parsedTxs.length; i++) {
        const tx = parsedTxs[i];
        const sigInfo = signatures[i];
        if (!tx || !tx.meta) continue;

        // Find vault account index in accountKeys
        const accountKeys = tx.transaction.message.accountKeys.map((k) =>
          typeof k === "string" ? k : k.pubkey.toBase58()
        );
        const vaultIndex = accountKeys.indexOf(vaultAddress);
        if (vaultIndex === -1) continue;

        // Get balance change for vault
        const preBalance = tx.meta.preBalances[vaultIndex];
        const postBalance = tx.meta.postBalances[vaultIndex];
        const balanceChange = postBalance - preBalance;

        if (balanceChange === 0) continue;

        // Determine type and counterparty
        const isSpend = balanceChange < 0;
        const amountLamports = Math.abs(balanceChange);

        // For spends, subtract the fee reimbursement to get actual amount
        // Must match programs/cloaked/src/lib.rs SPEND_FEE_REIMBURSEMENT
        const SPEND_FEE_REIMBURSEMENT = 10000;
        // Must match programs/cloaked/src/lib.rs PRIVATE_OPERATION_FEE
        const PRIVATE_OPERATION_FEE = 50000;

        // Skip management operations (freeze/unfreeze/update constraints)
        // These deduct exactly PRIVATE_OPERATION_FEE from vault
        if (isSpend && amountLamports === PRIVATE_OPERATION_FEE) {
          continue;
        }

        const actualAmount = isSpend
          ? Math.max(0, amountLamports - SPEND_FEE_REIMBURSEMENT)
          : amountLamports;

        // Find counterparty (the other account with opposite balance change)
        // For spends: find largest positive change (destination, not fee_payer who only gets 10k)
        // For funds: find account that sent funds
        let counterparty = "";
        let maxChange = 0;
        for (let j = 0; j < accountKeys.length; j++) {
          if (j === vaultIndex) continue;
          const otherChange = tx.meta.postBalances[j] - tx.meta.preBalances[j];
          if (isSpend && otherChange > maxChange) {
            counterparty = accountKeys[j];
            maxChange = otherChange;
          } else if (!isSpend && otherChange < 0) {
            counterparty = accountKeys[j];
            break;
          }
        }

        parsed.push({
          signature: sigInfo.signature,
          type: isSpend ? "spend" : "fund",
          amount: actualAmount / 1e9, // Convert to SOL
          address: counterparty,
          timestamp: new Date((sigInfo.blockTime ?? 0) * 1000),
          status: sigInfo.confirmationStatus === "finalized" ? "finalized" : "confirmed",
        });
      }

      setTransactions(parsed);
      txCache.set(cacheKey, { transactions: parsed, timestamp: Date.now() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err : new Error("Failed to fetch transactions"));
    } finally {
      setIsLoading(false);
    }
  }, [connection, delegateId]);

  // Initial fetch - slightly delayed to avoid rate limits on page load
  useEffect(() => {
    const timer = setTimeout(() => fetchTransactions(false), 500);
    return () => clearTimeout(timer);
  }, [fetchTransactions]);

  // Refetch on window focus
  useEffect(() => {
    const handleFocus = () => fetchTransactions(false);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchTransactions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const refetch = useCallback(() => fetchTransactions(true), [fetchTransactions]);

  return {
    transactions,
    isLoading,
    error,
    refetch,
  };
}
