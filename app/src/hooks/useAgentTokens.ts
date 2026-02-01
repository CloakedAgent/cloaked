"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { CLOAKED_PROGRAM_ID, CLOAKED_AGENT_STATE_SIZE } from "@/lib/constants";

// Simple in-memory cache for token data
const tokenCache = new Map<string, { tokens: AgentToken[]; timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds

export interface AgentToken {
  address: PublicKey;
  /** Owner pubkey - null for Cloaked Agents (private mode) */
  owner: PublicKey | null;
  /** Owner commitment for private mode (all zeros for standard mode) */
  ownerCommitment: Uint8Array;
  delegate: PublicKey;
  balance: number;
  constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
    expiresAt: Date | null;
    frozen: boolean;
  };
  spending: {
    totalSpent: number;
    dailySpent: number;
    dailyRemaining: number;
    totalRemaining: number;
  };
  status: "active" | "frozen" | "expired";
  createdAt: Date;
  /** Whether this is a Cloaked Agent (private mode) */
  isPrivate: boolean;
}

function parseTokenState(data: Buffer, address: PublicKey, balance: number): AgentToken {
  // Skip 8-byte discriminator
  let offset = 8;

  // Owner (Option<Pubkey>): 1 byte discriminant + 32 bytes if Some
  const ownerDiscriminant = data.readUInt8(offset);
  offset += 1;
  let owner: PublicKey | null = null;
  if (ownerDiscriminant === 1) {
    // Some(pubkey) - advance 32 bytes only when present
    owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
  }
  // If None (private mode), no pubkey bytes to skip

  // Owner commitment (32 bytes)
  const ownerCommitment = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  // Delegate (32 bytes)
  const delegate = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // max_per_tx (u64)
  const maxPerTx = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // daily_limit (u64)
  const dailyLimit = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // total_limit (u64)
  const totalLimit = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // expires_at (i64)
  const expiresAtRaw = Number(data.readBigInt64LE(offset));
  const expiresAt = expiresAtRaw > 0 ? new Date(expiresAtRaw * 1000) : null;
  offset += 8;

  // frozen (bool, 1 byte)
  const frozen = data.readUInt8(offset) === 1;
  offset += 1;

  // total_spent (u64)
  const totalSpent = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // daily_spent (u64)
  const dailySpent = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // last_day (i64) - skip
  offset += 8;

  // bump (u8) - skip
  offset += 1;

  // created_at (i64)
  const createdAtRaw = Number(data.readBigInt64LE(offset));
  const createdAt = new Date(createdAtRaw * 1000);

  // Determine status
  let status: "active" | "frozen" | "expired" = "active";
  if (frozen) {
    status = "frozen";
  } else if (expiresAt && expiresAt.getTime() < Date.now()) {
    status = "expired";
  }

  // Calculate remaining
  const dailyRemaining = dailyLimit > 0 ? Math.max(0, dailyLimit - dailySpent) : Infinity;
  const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - totalSpent) : Infinity;

  // Check if private mode (owner is None)
  const isPrivate = owner === null;

  return {
    address,
    owner,
    ownerCommitment,
    delegate,
    balance,
    constraints: {
      maxPerTx,
      dailyLimit,
      totalLimit,
      expiresAt,
      frozen,
    },
    spending: {
      totalSpent,
      dailySpent,
      dailyRemaining: dailyRemaining === Infinity ? -1 : dailyRemaining,
      totalRemaining: totalRemaining === Infinity ? -1 : totalRemaining,
    },
    status,
    createdAt,
    isPrivate,
  };
}

export function useAgentTokens() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTokens = useCallback(async (skipCache = false) => {
    if (!publicKey) {
      setTokens([]);
      return;
    }

    // Check cache first (for instant page transitions)
    const cacheKey = publicKey.toBase58();
    const cached = tokenCache.get(cacheKey);
    if (!skipCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setTokens(cached.tokens);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      // Fetch all CloakedAgentState accounts owned by this wallet (standard mode only)
      // owner field is at offset 8, with 1-byte Option discriminant + 32-byte pubkey
      // For Some(pubkey), discriminant is 1, pubkey follows at offset 9
      const accounts = await connection.getProgramAccounts(CLOAKED_PROGRAM_ID, {
        filters: [
          { dataSize: CLOAKED_AGENT_STATE_SIZE },
          {
            memcmp: {
              offset: 9, // Skip discriminator (8) + Option discriminant (1)
              bytes: publicKey.toBase58(),
            },
          },
        ],
      });

      if (accounts.length === 0) {
        setTokens([]);
        tokenCache.set(cacheKey, { tokens: [], timestamp: Date.now() });
        return;
      }

      // Derive all vault PDAs upfront
      const vaultPdas = accounts.map(({ pubkey }) => {
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), pubkey.toBuffer()],
          CLOAKED_PROGRAM_ID
        );
        return vaultPda;
      });

      // Batch fetch all vault balances in a single RPC call
      const balanceResults = await connection.getMultipleAccountsInfo(vaultPdas);

      // Parse all accounts with their balances
      const parsedTokens = accounts.map(({ pubkey, account }, index) => {
        const balance = balanceResults[index]?.lamports ?? 0;
        return parseTokenState(account.data as Buffer, pubkey, balance);
      });

      // Sort by creation date (newest first)
      parsedTokens.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setTokens(parsedTokens);
      tokenCache.set(cacheKey, { tokens: parsedTokens, timestamp: Date.now() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  // Initial fetch with cache
  useEffect(() => {
    fetchTokens(false);
  }, [fetchTokens]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(() => fetchTokens(true), [fetchTokens]);

  return {
    tokens,
    loading,
    error,
    refresh,
  };
}

// Hook to fetch a single agent by delegate public key
export function useAgentToken(delegatePublicKey: string | null) {
  const { connection } = useConnection();
  const [token, setToken] = useState<AgentToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    if (!delegatePublicKey) {
      setToken(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const delegate = new PublicKey(delegatePublicKey);

      // Derive agent state PDA
      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegate.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      // Fetch account data
      const accountInfo = await connection.getAccountInfo(agentStatePda);
      if (!accountInfo) {
        setError("Agent not found");
        setToken(null);
        return;
      }

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      // Get vault balance
      const balance = await connection.getBalance(vaultPda);

      const parsed = parseTokenState(
        accountInfo.data as Buffer,
        agentStatePda,
        balance
      );

      setToken(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent");
    } finally {
      setLoading(false);
    }
  }, [connection, delegatePublicKey]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return {
    token,
    loading,
    error,
    refresh: fetchToken,
  };
}
