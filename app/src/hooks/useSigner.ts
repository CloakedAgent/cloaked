"use client";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import type { Signer } from "@cloakedagent/sdk";

/**
 * Hook to get a Signer from the wallet adapter.
 * useAnchorWallet() already returns an interface compatible with Signer,
 * so this is just a thin wrapper for type clarity.
 */
export function useSigner(): Signer | null {
  const wallet = useAnchorWallet();
  return wallet ?? null;
}
