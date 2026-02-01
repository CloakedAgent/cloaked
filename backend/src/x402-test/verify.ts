/**
 * x402 Payment Verification
 *
 * Verifies that a payment signature is valid and the payment landed on-chain.
 */

import { Connection, PublicKey } from "@solana/web3.js";

export interface PaymentRequirements {
  payTo: string;
  amount: string; // lamports as string
  currency: string;
  network: string;
}

export interface VerifyPaymentResult {
  valid: boolean;
  signature?: string;
  amount?: number;
  error?: string;
}

/**
 * Verify a payment signature on-chain
 *
 * Checks that:
 * 1. Transaction exists and is confirmed
 * 2. Payment was sent to the expected recipient
 * 3. Amount is >= required amount
 */
export async function verifyPayment(
  connection: Connection,
  signature: string,
  requirements: PaymentRequirements
): Promise<VerifyPaymentResult> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      return { valid: false, error: "Transaction not found or not confirmed" };
    }

    if (tx.meta.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    // Find transfer to expected recipient
    const expectedRecipient = requirements.payTo;
    const expectedAmount = parseInt(requirements.amount);
    const accountKeys = tx.transaction.message.staticAccountKeys;

    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys[i].toBase58() === expectedRecipient) {
        const preBalance = tx.meta.preBalances[i] || 0;
        const postBalance = tx.meta.postBalances[i] || 0;
        const received = postBalance - preBalance;

        if (received >= expectedAmount) {
          return {
            valid: true,
            signature,
            amount: received,
          };
        } else {
          return {
            valid: false,
            error: `Insufficient amount: received ${received}, required ${expectedAmount}`,
          };
        }
      }
    }

    return { valid: false, error: "Payment recipient not found in transaction" };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}

/**
 * Build x402 payment requirements for a resource
 */
export function buildPaymentRequirements(
  payTo: string,
  amountLamports: number
): PaymentRequirements {
  return {
    payTo,
    amount: amountLamports.toString(),
    currency: "SOL",
    network: "solana-devnet",
  };
}

/**
 * Encode payment requirements as base64 JSON (x402 spec)
 */
export function encodePaymentRequired(requirements: PaymentRequirements): string {
  return Buffer.from(JSON.stringify(requirements)).toString('base64');
}

/**
 * Decode base64 payment payload (x402 spec)
 */
export function decodePaymentPayload(encoded: string): { signature: string } {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const payload = JSON.parse(decoded);

  if (!payload.signature || typeof payload.signature !== 'string' || payload.signature.trim() === '') {
    throw new Error('Invalid payment payload: missing or empty signature');
  }

  return payload;
}
