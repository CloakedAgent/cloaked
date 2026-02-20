import { PublicKey } from "@solana/web3.js";

// Cloaked Program ID (deployed on devnet)
export const CLOAKED_PROGRAM_ID = new PublicKey(
  "3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB"
);

// ZK Verifier Program ID - Attestation verifier (deployed on devnet)
export const ZK_VERIFIER_PROGRAM_ID = new PublicKey(
  "G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F"
);

// Known SPL Token Mints
export const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; name: string }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", decimals: 6, name: "USD Coin" },
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": { symbol: "USDC", decimals: 6, name: "USD Coin (Devnet)" },
};
