/**
 * Relayer Client for Truly Private Cloaked Agent Creation
 *
 * Handles communication with the backend relayer service for creating
 * agents without the user's wallet signing any on-chain transaction.
 *
 * Security:
 * - Agent Key encrypted with NaCl box (X25519) - decrypted client-side
 * - User's wallet only signs "Cloak Private Agent" message for secret derivation
 * - User's wallet NEVER appears in any on-chain transaction
 *
 * Economics:
 * - User sends total (0.01 SOL fee + funding) to relayer via Privacy Cash
 * - Relayer keeps 0.01 SOL fee, forwards rest to vault
 */

import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { deriveAgentSecrets, commitmentToBytes } from "./zk";
import { getBackendUrl } from "./config";

/** Options for creating a private agent via relayer */
export interface CreatePrivateViaRelayerOptions {
  maxPerTx?: number;
  dailyLimit?: number;
  totalLimit?: number;
  expiresAt?: Date | null;
}

/** Result from creating a Cloaked Agent via relayer */
export interface CreatePrivateViaRelayerResult {
  agentKey: string;
  agentStatePda: PublicKey;
  vaultPda: PublicKey;
  delegate: PublicKey;
  signature: string;
}

/** Relayer status response */
export interface RelayerStatus {
  address: string;
  balance: number;
  minBalance: number;
  ready: boolean;
  creationFee: number; // 0.01 SOL in lamports
  minDeposit: number; // Minimum deposit in lamports
}

/** Backend API response for create-private */
interface CreatePrivateResponse {
  encryptedAgentKey: string;
  nonce: string;
  agentStatePda: string;
  vaultPda: string;
  delegate: string;
  signature: string;
}

/**
 * Handle relayer API error responses
 */
async function handleRelayerError(response: Response, defaultMessage: string): Promise<never> {
  const error = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
  throw new Error(error.error || `${defaultMessage}: ${response.status}`);
}

/**
 * Make a POST request to a relayer endpoint and return the signature
 */
async function postRelayerOperation<T>(
  endpoint: string,
  params: T,
  apiUrl?: string
): Promise<string> {
  const baseUrl = apiUrl || getBackendUrl();
  const response = await fetch(`${baseUrl}/api/relayer/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    await handleRelayerError(response, "Relayer request failed");
  }

  const result = await response.json() as { signature: string };
  return result.signature;
}

/**
 * Get relayer status
 *
 * @param apiUrl - Optional API URL (defaults to CLOAK_API_URL or localhost:3645)
 * @returns Relayer status including balance and readiness
 */
export async function getRelayerStatus(apiUrl?: string): Promise<RelayerStatus> {
  const baseUrl = apiUrl || getBackendUrl();
  const response = await fetch(`${baseUrl}/api/relayer/status`);

  if (!response.ok) {
    await handleRelayerError(response, "Relayer status check failed");
  }

  return response.json() as Promise<RelayerStatus>;
}

/**
 * Create a Cloaked Agent via relayer
 *
 * The relayer signs and pays for the transaction, ensuring the user's wallet
 * never appears on-chain. The Agent Key is encrypted and only the user can decrypt it.
 *
 * Flow:
 * 1. User sends total (fee + funding) to relayer via Privacy Cash
 * 2. Call this function with the deposit tx signature
 * 3. Relayer keeps 0.01 SOL fee, forwards rest to vault
 * 4. Relayer creates agent, encrypts Agent Key for user
 *
 * @param masterSecret - Master secret derived from wallet signature
 * @param nonce - Agent index (0, 1, 2, ...)
 * @param options - Agent creation options
 * @param depositSignature - Privacy Cash tx signature to relayer
 * @param depositAmount - Total lamports sent (fee + vault funding)
 * @param apiUrl - Optional API URL
 * @returns Agent Key and PDA addresses
 */
export async function createPrivateAgentViaRelayer(
  masterSecret: bigint,
  nonce: number,
  options: CreatePrivateViaRelayerOptions,
  depositSignature: string,
  depositAmount: number,
  apiUrl?: string
): Promise<CreatePrivateViaRelayerResult> {
  const baseUrl = apiUrl || getBackendUrl();

  const { commitment } = await deriveAgentSecrets(masterSecret, nonce);
  const commitmentBytes = commitmentToBytes(commitment);

  const encryptionKeypair = nacl.box.keyPair();

  const body = {
    ownerCommitment: Array.from(commitmentBytes),
    maxPerTx: options.maxPerTx ?? 0,
    dailyLimit: options.dailyLimit ?? 0,
    totalLimit: options.totalLimit ?? 0,
    expiresAt: options.expiresAt ? Math.floor(options.expiresAt.getTime() / 1000) : 0,
    clientPublicKey: Array.from(encryptionKeypair.publicKey),
    depositSignature,
    depositAmount,
  };

  const response = await fetch(`${baseUrl}/api/relayer/create-private`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleRelayerError(response, "Relayer request failed");
  }

  const result = await response.json() as CreatePrivateResponse;

  // Decrypt Agent Key
  const agentKey = decryptAgentKey(
    result.encryptedAgentKey,
    result.nonce,
    encryptionKeypair.secretKey
  );

  return {
    agentKey,
    agentStatePda: new PublicKey(result.agentStatePda),
    vaultPda: new PublicKey(result.vaultPda),
    delegate: new PublicKey(result.delegate),
    signature: result.signature,
  };
}

/** Private operation parameters for relayer */
export interface PrivateOperationParams {
  agentStatePda: string;
  proofBytes: number[];
  witnessBytes: number[];
}

/** Update constraints private parameters */
export interface UpdateConstraintsPrivateParams extends PrivateOperationParams {
  maxPerTx: number | null;
  dailyLimit: number | null;
  totalLimit: number | null;
  expiresAt: number | null;
}

/** Withdraw private parameters */
export interface WithdrawPrivateParams extends PrivateOperationParams {
  amount: number;
  destination: string;
}

/** Close private parameters */
export interface ClosePrivateParams extends PrivateOperationParams {
  destination: string;
}

/**
 * Freeze a private agent via relayer
 */
export async function freezePrivateViaRelayer(
  params: PrivateOperationParams,
  apiUrl?: string
): Promise<string> {
  return postRelayerOperation("freeze-private", params, apiUrl);
}

/**
 * Unfreeze a private agent via relayer
 */
export async function unfreezePrivateViaRelayer(
  params: PrivateOperationParams,
  apiUrl?: string
): Promise<string> {
  return postRelayerOperation("unfreeze-private", params, apiUrl);
}

/**
 * Update constraints for a private agent via relayer
 */
export async function updateConstraintsPrivateViaRelayer(
  params: UpdateConstraintsPrivateParams,
  apiUrl?: string
): Promise<string> {
  return postRelayerOperation("update-constraints-private", params, apiUrl);
}

/**
 * Withdraw from a private agent via relayer
 */
export async function withdrawPrivateViaRelayer(
  params: WithdrawPrivateParams,
  apiUrl?: string
): Promise<string> {
  return postRelayerOperation("withdraw-private", params, apiUrl);
}

/**
 * Close a private agent via relayer
 */
export async function closePrivateViaRelayer(
  params: ClosePrivateParams,
  apiUrl?: string
): Promise<string> {
  return postRelayerOperation("close-private", params, apiUrl);
}

/**
 * Co-sign and submit a spend transaction via relayer
 *
 * The SDK builds the transaction, delegate signs, then sends to relayer.
 * Relayer adds its signature as fee payer and submits to the network.
 *
 * @param transactionBase64 - Base64 encoded partially-signed transaction
 * @param apiUrl - Optional API URL
 * @returns Transaction signature
 */
export async function cosignSpendViaRelayer(
  transactionBase64: string,
  apiUrl?: string
): Promise<string> {
  const baseUrl = apiUrl || getBackendUrl();
  const response = await fetch(`${baseUrl}/api/relayer/cosign-spend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: transactionBase64 }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string; code?: string };
    const message = errorData.error || `Relayer cosign failed: ${response.status}`;
    const err = new Error(message);
    (err as Error & { code?: string }).code = errorData.code;
    throw err;
  }

  const result = await response.json() as { signature: string };
  return result.signature;
}

/**
 * Get the relayer public key for use as fee payer
 * Uses lightweight /pubkey endpoint that doesn't require RPC calls
 *
 * @param apiUrl - Optional API URL
 * @returns Relayer public key
 */
export async function getRelayerPublicKey(apiUrl?: string): Promise<PublicKey> {
  const baseUrl = apiUrl || getBackendUrl();

  try {
    const response = await fetch(`${baseUrl}/api/relayer/pubkey`);
    if (response.ok) {
      const data = await response.json() as { address: string };
      return new PublicKey(data.address);
    }
  } catch {
    // Fall back to status endpoint
  }

  const status = await getRelayerStatus(apiUrl);
  return new PublicKey(status.address);
}

/**
 * Decrypt Agent Key received from relayer
 *
 * @param encryptedBase58 - Base58 encoded encrypted data (ephemeral pubkey + ciphertext)
 * @param nonceBase58 - Base58 encoded nonce
 * @param secretKey - Client's X25519 secret key
 * @returns Decrypted Agent Key
 */
function decryptAgentKey(
  encryptedBase58: string,
  nonceBase58: string,
  secretKey: Uint8Array
): string {
  const encrypted = bs58.decode(encryptedBase58);
  const nonce = bs58.decode(nonceBase58);

  // First 32 bytes are the ephemeral public key, rest is ciphertext
  const ephemeralPublicKey = encrypted.slice(0, 32);
  const ciphertext = encrypted.slice(32);

  const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, secretKey);

  if (!decrypted) {
    throw new Error("Failed to decrypt Agent Key - invalid encryption");
  }

  return new TextDecoder().decode(decrypted);
}
