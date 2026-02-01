/**
 * ZK Proof generation for private agent ownership
 *
 * Client-side proving using bb.js WASM - secret never leaves the browser.
 * Proof is sent to backend for attestation (Groth16 conversion for Solana).
 */

import { getBackendUrl } from "../config";
import {
  generateOwnershipProofBrowser,
  isBrowserProverAvailable,
  verifyPoseidonCompatibility,
  type BrowserProof,
} from "./browser-prover";

/** Ownership proof components for Solana program */
export interface OwnershipProof {
  /** Full Groth16 proof bytes (324 bytes for gnark) */
  proofBytes: Uint8Array;
  /** Full public witness bytes (12-byte header + inputs) */
  witnessBytes: Uint8Array;
}

/** Backend prover status response */
interface ProverStatusResponse {
  ready: boolean;
  error?: string;
}

/** Backend proof response */
interface ProofResponse {
  proofBytes: number[];
  witnessBytes: number[];
}

/** Backend error response */
interface ErrorResponse {
  error?: string;
  details?: string;
}

// Prover readiness state
let proverReady = false;

/**
 * Initialize the prover (checks backend availability)
 *
 * Should be called once on app load. Verifies the backend
 * attestation prover service is available and ready.
 */
export async function initProver(): Promise<void> {
  try {
    // Check backend is available
    const response = await fetch(`${getBackendUrl()}/api/prover/status`);
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    const status = (await response.json()) as ProverStatusResponse;
    if (!status.ready) {
      throw new Error(status.error || "Prover not ready");
    }

    // Verify Poseidon hash compatibility between SDK and Noir circuit
    // This catches build/version mismatches early
    if (isBrowserProverAvailable()) {
      await verifyPoseidonCompatibility();
    }

    proverReady = true;
  } catch (error) {
    throw new Error(
      `Failed to initialize prover: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if prover is initialized
 */
export function isProverReady(): boolean {
  return proverReady;
}

/**
 * Convert browser UltraHonk proof to Solana-compatible Groth16 format
 *
 * Attestation flow:
 * 1. Browser generates UltraHonk proof (secret stays local)
 * 2. Send proof bytes + public inputs to backend (NO secret transmitted!)
 * 3. Backend verifies UltraHonk proof using bb.js
 * 4. If valid, backend generates Groth16 attestation proof
 * 5. Returns Groth16 proof for Solana
 *
 * Privacy guarantee: The agent_secret NEVER leaves the browser.
 */
async function browserProofToOwnershipProof(
  browserProof: BrowserProof
): Promise<OwnershipProof> {
  const response = await fetch(`${getBackendUrl()}/api/prove/attestation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proofBytes: Array.from(browserProof.proof),
      publicInputs: browserProof.publicInputs,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: "Unknown error" }))) as ErrorResponse;
    throw new Error(`Attestation proof failed: ${error.error || error.details || "Unknown error"}`);
  }

  const result = (await response.json()) as ProofResponse;

  return {
    proofBytes: new Uint8Array(result.proofBytes),
    witnessBytes: new Uint8Array(result.witnessBytes),
  };
}

/**
 * Generate ZK ownership proof
 *
 * Uses client-side bb.js to generate UltraHonk proof, then sends
 * proof artifacts to backend for Groth16 attestation.
 *
 * Requires browser environment with SharedArrayBuffer support.
 *
 * @param agentSecret - The private agent secret
 * @param commitment - The public commitment (must match on-chain)
 * @returns Proof components for Solana program
 */
export async function generateOwnershipProof(
  agentSecret: bigint,
  commitment: bigint
): Promise<OwnershipProof> {
  if (!isBrowserProverAvailable()) {
    throw new Error(
      "Client-side proving requires a browser with SharedArrayBuffer support. " +
      "Ensure your site is served with proper COOP/COEP headers."
    );
  }

  // Generate UltraHonk proof in browser (secret stays local)
  const browserProof = await generateOwnershipProofBrowser(agentSecret, commitment);

  // Send proof to backend for attestation (secret NOT transmitted)
  return browserProofToOwnershipProof(browserProof);
}

/**
 * Convert proof to format expected by Solana program
 *
 * @param proof - Ownership proof
 * @returns Arrays ready for program instruction
 */
export function proofToInstructionArgs(proof: OwnershipProof): {
  proofBytes: number[];
  witnessBytes: number[];
} {
  return {
    proofBytes: Array.from(proof.proofBytes),
    witnessBytes: Array.from(proof.witnessBytes),
  };
}

// Re-export setBackendUrl for backwards compatibility
export { setBackendUrl } from "../config";
