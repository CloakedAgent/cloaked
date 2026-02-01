"use client";

import { PublicKey } from "@solana/web3.js";

/**
 * Format lamports to SOL string
 */
export function formatSol(lamports: number, decimals: number = 4): string {
  return (lamports / 1e9).toFixed(decimals);
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1e9);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

/**
 * Validate a Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
