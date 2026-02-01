import { PublicKey } from "@solana/web3.js";

/** Cloaked Agent state from on-chain account */
export interface CloakedAgentState {
  address: PublicKey;
  /** Owner pubkey (null for Cloaked Agents) */
  owner: PublicKey | null;
  /** Owner commitment for private mode (zeros for standard mode) */
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

/** Options for creating a new Cloaked Agent */
export interface CreateAgentOptions {
  /** Optional - SDK generates a new delegate keypair if not provided */
  delegate?: PublicKey;
  maxPerTx?: number;
  dailyLimit?: number;
  totalLimit?: number;
  expiresAt?: Date | null;
  initialDeposit?: number;
}

/** Options for updating constraints */
export interface ConstraintOptions {
  maxPerTx?: number;
  dailyLimit?: number;
  totalLimit?: number;
  expiresAt?: Date | null;
}

/** Options for spending */
export interface SpendOptions {
  destination: PublicKey;
  amount: number;
  /**
   * Optional fee payer signer. If provided, this wallet pays the tx fee directly
   * (no relayer involved, no 10k lamport overhead). If not provided, the relayer
   * pays and gets reimbursed from the vault (10k lamports).
   *
   * For standard mode: pass the user's connected wallet to pay directly
   * For agent/MCP mode: leave undefined to use relayer
   */
  feePayer?: any; // Signer type - using any to avoid circular dependency
}

/** Result of spend operation */
export interface SpendResult {
  signature: string;
  remainingBalance: number;
  dailyRemaining: number;
}
