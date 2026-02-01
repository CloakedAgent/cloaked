/**
 * Deterministic secret derivation for private agents
 *
 * The secret derivation chain:
 * 1. User signs "Cloak Private Agent" → signature
 * 2. master_secret = sha256(signature)
 * 3. agent_secret = poseidon(master_secret, nonce)
 * 4. commitment = poseidon(agent_secret)
 *
 * Same wallet always produces same master_secret, enabling
 * deterministic discovery of private agents across devices.
 */

import { poseidon } from "./poseidon";

/** Message signed to derive master secret */
const SIGN_MESSAGE = "Cloak Private Agent";

/** Maximum agents to scan during discovery */
export const MAX_AGENTS = 100;

/** Secrets for a private agent */
export interface PrivateAgentSecrets {
  masterSecret: bigint;
  agentSecret: bigint;
  commitment: bigint;
  nonce: number;
}

/**
 * Derive master secret from wallet signature
 *
 * Same wallet always produces same master secret, enabling
 * deterministic discovery across devices.
 *
 * @param signMessage - Wallet's signMessage function
 * @returns Master secret as bigint
 */
export async function deriveMasterSecret(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<bigint> {
  const message = new TextEncoder().encode(SIGN_MESSAGE);
  const signature = await signMessage(message);

  // Hash signature to get master secret using Web Crypto API
  // Note: wrap in Uint8Array for compatibility with wallet adapters
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(signature));
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to bigint (take first 31 bytes to fit in BN254 field)
  let masterSecret = BigInt(0);
  for (let i = 0; i < 31; i++) {
    masterSecret = (masterSecret << BigInt(8)) | BigInt(hashArray[i]);
  }

  return masterSecret;
}

/**
 * Derive agent secret and commitment for a specific nonce
 *
 * @param masterSecret - Master secret from wallet signature
 * @param nonce - Agent index (0, 1, 2, ...)
 * @returns Agent secret and commitment
 */
export async function deriveAgentSecrets(
  masterSecret: bigint,
  nonce: number
): Promise<{ agentSecret: bigint; commitment: bigint }> {
  // agent_secret = poseidon(master_secret, nonce)
  const agentSecret = await poseidon([masterSecret, BigInt(nonce)]);

  // commitment = poseidon(agent_secret)
  const commitment = await poseidon([agentSecret]);

  return { agentSecret, commitment };
}

/**
 * Convert commitment bigint to bytes for on-chain storage
 *
 * @param commitment - Commitment as bigint
 * @returns 32-byte array
 */
export function commitmentToBytes(commitment: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let value = commitment;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return bytes;
}

/**
 * Convert bytes to commitment bigint
 *
 * @param bytes - 32-byte array
 * @returns Commitment as bigint
 */
export function bytesToCommitment(bytes: Uint8Array): bigint {
  let commitment = BigInt(0);
  for (let i = 0; i < 32; i++) {
    commitment = (commitment << BigInt(8)) | BigInt(bytes[i]);
  }
  return commitment;
}

/**
 * Get the sign message used for master secret derivation
 * (Useful for wallet UI to show what's being signed)
 */
export function getSignMessage(): string {
  return SIGN_MESSAGE;
}
