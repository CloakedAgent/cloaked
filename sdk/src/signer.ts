import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

/**
 * Signer interface - matches Anchor's Wallet interface exactly.
 * This allows the SDK to work with both:
 * - Frontend: useAnchorWallet() already returns this interface
 * - Backend/MCP: Use keypairToSigner() to adapt a Keypair
 */
export interface Signer {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * Adapt a Keypair to the Signer interface.
 * Use this in backend code or MCP tools where you have a Keypair.
 */
export function keypairToSigner(keypair: Keypair): Signer {
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof Transaction) {
        tx.partialSign(keypair);
      } else {
        tx.sign([keypair]);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      return txs.map((tx) => {
        if (tx instanceof Transaction) {
          tx.partialSign(keypair);
        } else {
          tx.sign([keypair]);
        }
        return tx;
      });
    },
  };
}
