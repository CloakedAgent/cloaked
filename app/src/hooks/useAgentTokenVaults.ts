"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CLOAKED_PROGRAM_ID, TOKEN_VAULT_STATE_SIZE, KNOWN_TOKENS } from "@/lib/constants";

export interface TokenVaultInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  depositAddress: PublicKey;
  constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
  };
  spending: {
    totalSpent: number;
    dailySpent: number;
    dailyRemaining: number;
    totalRemaining: number;
  };
}

function parseTokenVaultState(data: Buffer, vaultPda: PublicKey): Omit<TokenVaultInfo, "balance"> | null {
  if (data.length < TOKEN_VAULT_STATE_SIZE) return null;

  let offset = 8; // skip discriminator

  // agent_state (32 bytes) - skip, we already filtered by it
  offset += 32;

  // mint (32 bytes)
  const mint = new PublicKey(data.subarray(offset, offset + 32));
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

  // created_at (i64) - skip
  // offset += 8;

  const mintStr = mint.toBase58();
  const known = KNOWN_TOKENS[mintStr];

  const dailyRemaining = dailyLimit > 0 ? Math.max(0, dailyLimit - dailySpent) : -1;
  const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - totalSpent) : -1;

  const depositAddress = getAssociatedTokenAddressSync(mint, vaultPda, true);

  return {
    mint,
    symbol: known?.symbol ?? "UNKNOWN",
    name: known?.name ?? "Unknown Token",
    decimals: known?.decimals ?? 0,
    depositAddress,
    constraints: { maxPerTx, dailyLimit, totalLimit },
    spending: { totalSpent, dailySpent, dailyRemaining, totalRemaining },
  };
}

/**
 * Fetch all enabled TokenVaultState accounts for a given agent.
 * Uses getProgramAccounts with memcmp filter on agent_state field.
 */
export function useAgentTokenVaults(agentStatePda: string | null) {
  const { connection } = useConnection();
  const [tokens, setTokens] = useState<TokenVaultInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenVaults = useCallback(async () => {
    if (!agentStatePda) {
      setTokens([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const agentPda = new PublicKey(agentStatePda);

      // Derive vault PDA for ATA lookups
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentPda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      // Fetch all TokenVaultState accounts for this agent
      const accounts = await connection.getProgramAccounts(CLOAKED_PROGRAM_ID, {
        filters: [
          { dataSize: TOKEN_VAULT_STATE_SIZE },
          {
            memcmp: {
              offset: 8, // after discriminator, agent_state is first field
              bytes: agentPda.toBase58(),
            },
          },
        ],
      });

      if (accounts.length === 0) {
        setTokens([]);
        return;
      }

      // Parse states and collect ATAs for balance lookups
      const parsed: { info: Omit<TokenVaultInfo, "balance">; ata: PublicKey }[] = [];
      for (const { account } of accounts) {
        const info = parseTokenVaultState(account.data as Buffer, vaultPda);
        if (info) {
          parsed.push({ info, ata: info.depositAddress });
        }
      }

      // Batch fetch all ATA balances
      const ataInfos = await connection.getMultipleAccountsInfo(parsed.map((p) => p.ata));

      const results: TokenVaultInfo[] = parsed.map(({ info }, i) => {
        const ataInfo = ataInfos[i];
        let balance = 0;
        if (ataInfo && ataInfo.data.length >= 72) {
          // SPL token account: amount is at offset 64, u64 LE
          balance = Number((ataInfo.data as Buffer).readBigUInt64LE(64));
        }
        return { ...info, balance };
      });

      setTokens(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch token vaults");
    } finally {
      setLoading(false);
    }
  }, [connection, agentStatePda]);

  useEffect(() => {
    fetchTokenVaults();
  }, [fetchTokenVaults]);

  return { tokens, loading, error, refresh: fetchTokenVaults };
}
