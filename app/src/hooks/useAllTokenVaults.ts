"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { CLOAKED_PROGRAM_ID, TOKEN_VAULT_STATE_SIZE, KNOWN_TOKENS } from "@/lib/constants";

export interface TokenSummary {
  symbol: string;
  mint: string;
}

export interface TokenVaultWithBalance extends TokenSummary {
  balance: number;
  decimals: number;
  dailySpent: number;
  dailyLimit: number;
}

/**
 * Fetches ALL TokenVaultState accounts in a single RPC call and groups by agent.
 * Returns a map of agentStatePda -> TokenSummary[].
 * Used for lightweight token badges on grid cards and sidebar.
 */
export function useAllTokenVaults() {
  const { connection } = useConnection();
  const [vaultMap, setVaultMap] = useState<Map<string, TokenSummary[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const accounts = await connection.getProgramAccounts(CLOAKED_PROGRAM_ID, {
        filters: [{ dataSize: TOKEN_VAULT_STATE_SIZE }],
        dataSlice: { offset: 8, length: 64 }, // agent_state (32) + mint (32)
      });

      const map = new Map<string, TokenSummary[]>();
      for (const { account } of accounts) {
        const data = account.data as Buffer;
        const agentState = new PublicKey(data.subarray(0, 32)).toBase58();
        const mint = new PublicKey(data.subarray(32, 64)).toBase58();
        const known = KNOWN_TOKENS[mint];

        const existing = map.get(agentState) ?? [];
        existing.push({ symbol: known?.symbol ?? "?", mint });
        map.set(agentState, existing);
      }

      setVaultMap(map);
    } catch {
      // Non-critical - badges just won't show
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { fetch(); }, [fetch]);

  return { vaultMap, loading, refresh: fetch };
}

const SECONDS_PER_DAY = 86400;

/**
 * Fetches full TokenVaultState data + ATA balances for a specific mint.
 * Returns empty map when mint is null (SOL mode — no extra RPC).
 * Lazy-loads token data only when user switches to token mode.
 */
export function useTokenVaultBalances(mint: string | null) {
  const { connection } = useConnection();
  const [balanceMap, setBalanceMap] = useState<Map<string, TokenVaultWithBalance>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!mint) {
      setBalanceMap(new Map());
      return;
    }

    setLoading(true);
    try {
      const mintPubkey = new PublicKey(mint);
      const known = KNOWN_TOKENS[mint];
      const symbol = known?.symbol ?? "?";
      const decimals = known?.decimals ?? 0;

      // Fetch all TokenVaultState accounts for this mint
      const accounts = await connection.getProgramAccounts(CLOAKED_PROGRAM_ID, {
        filters: [
          { dataSize: TOKEN_VAULT_STATE_SIZE },
          { memcmp: { offset: 40, bytes: mintPubkey.toBase58() } }, // mint at offset 8+32
        ],
      });

      const now = Math.floor(Date.now() / 1000);
      const currentDay = Math.floor(now / SECONDS_PER_DAY);
      const map = new Map<string, TokenVaultWithBalance>();

      // Batch-fetch ATA balances
      const ataAddresses: PublicKey[] = [];
      const agentStates: string[] = [];

      for (const { account } of accounts) {
        const data = account.data as Buffer;
        const agentState = new PublicKey(data.subarray(8, 40)).toBase58();
        agentStates.push(agentState);

        // Derive vault PDA and ATA
        const agentStatePda = new PublicKey(agentState);
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), agentStatePda.toBuffer()],
          CLOAKED_PROGRAM_ID
        );
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const ata = getAssociatedTokenAddressSync(mintPubkey, vaultPda, true);
        ataAddresses.push(ata);
      }

      // Batch fetch balances
      const balances = await Promise.all(
        ataAddresses.map(async (ata) => {
          try {
            const acc = await getAccount(connection, ata);
            return Number(acc.amount);
          } catch {
            return 0;
          }
        })
      );

      for (let i = 0; i < accounts.length; i++) {
        const data = accounts[i].account.data as Buffer;
        const agentState = agentStates[i];

        // Parse spending data from account: daily_spent(8) + daily_limit(8) + last_day(8)
        // Layout: discriminator(8) + agent_state(32) + mint(32) + max_per_tx(8) + daily_limit(8) + total_limit(8) + daily_spent(8) + total_spent(8) + last_day(8) + bump(1)
        const dailyLimitVal = new BN(data.subarray(80, 88), "le").toNumber();
        const totalLimitVal = new BN(data.subarray(88, 96), "le").toNumber();
        const dailySpentRaw = new BN(data.subarray(96, 104), "le").toNumber();
        const lastDay = new BN(data.subarray(112, 120), "le").toNumber();

        const dailySpent = currentDay > lastDay ? 0 : dailySpentRaw;

        map.set(agentState, {
          symbol,
          mint,
          balance: balances[i],
          decimals,
          dailySpent,
          dailyLimit: dailyLimitVal,
        });
      }

      setBalanceMap(map);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [connection, mint]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  return { balanceMap, loading, refresh: fetchBalances };
}
