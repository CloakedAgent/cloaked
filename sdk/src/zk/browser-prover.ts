/**
 * Browser-based ZK proof generation using bb.js
 *
 * Generates UltraHonk proofs in the browser - secret never leaves the client.
 * This is the secure alternative to the backend prover.
 *
 * NOTE: Uses non-ZK UltraHonk proofs (457 fields) because Sunspot's recursive
 * verifier does not support ZK proofs (508 fields). The inner circuit still
 * provides privacy for the agent_secret - the proof format difference only
 * affects the recursive verification layer.
 */

import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import circuit from "./ownership_proof.json";

/** Browser proof result from UltraHonk */
export interface BrowserProof {
  /** Raw proof bytes */
  proof: Uint8Array;
  /** Public inputs (commitment) */
  publicInputs: string[];
}

/** Recursive proof artifacts for Solana submission */
export interface RecursiveArtifacts {
  /** Proof as field elements */
  proofAsFields: string[];
  /** Verification key as field elements */
  vkAsFields: string[];
  /** Verification key hash */
  vkHash: string;
}

// Cached instances for performance
let cachedApi: Barretenberg | null = null;
let cachedBackend: UltraHonkBackend | null = null;
let cachedNoir: Noir | null = null;

/**
 * Initialize the browser prover (lazy initialization)
 * Call this early to warm up WASM loading
 */
export async function initBrowserProver(): Promise<void> {
  if (!cachedApi) {
    // Initialize Barretenberg with single thread for Node.js compatibility
    cachedApi = await Barretenberg.new({ threads: 1 });
  }
  if (!cachedBackend) {
    cachedBackend = new UltraHonkBackend(
      (circuit as { bytecode: string }).bytecode,
      cachedApi
    );
  }
  if (!cachedNoir) {
    cachedNoir = new Noir(circuit as CompiledCircuit);
    await cachedNoir.init();
  }
}

/**
 * Check if browser prover is available
 * (always true in browser environment with SharedArrayBuffer)
 */
export function isBrowserProverAvailable(): boolean {
  // Check if we're in a browser-like environment
  const isBrowser = typeof globalThis !== "undefined" &&
    typeof (globalThis as { document?: unknown }).document !== "undefined";

  // Check if SharedArrayBuffer is available (required for multi-threading)
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";

  return isBrowser && hasSharedArrayBuffer;
}

/**
 * Generate UltraHonk ownership proof in the browser
 *
 * Proves knowledge of agent_secret where poseidon(agent_secret) == commitment
 * without revealing the secret. Secret stays in browser memory.
 *
 * @param agentSecret - The private agent secret (bigint)
 * @param commitment - The public commitment (bigint)
 * @returns Browser proof with proof bytes and public inputs
 */
export async function generateOwnershipProofBrowser(
  agentSecret: bigint,
  commitment: bigint
): Promise<BrowserProof> {
  // Lazy initialize
  if (!cachedBackend || !cachedNoir) {
    await initBrowserProver();
  }

  const backend = cachedBackend!;
  const noir = cachedNoir!;

  // Format commitment as hex string with 0x prefix
  const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

  // Generate witness - this is where the circuit assertion happens
  let witness;
  try {
    const result = await noir.execute({
      agent_secret: agentSecret.toString(),
      commitment: commitmentHex,
    });
    witness = result.witness;
  } catch (error) {
    // Circuit assertion failed - commitment doesn't match poseidon(agentSecret)
    console.error("[browser-prover] Circuit execution failed:", error);
    console.error("[browser-prover] This usually means poseidon(agentSecret) != commitment");
    console.error("[browser-prover] agentSecret:", agentSecret.toString().slice(0, 20) + "...");
    console.error("[browser-prover] commitment:", commitmentHex);
    throw new Error(
      `ZK proof failed: commitment mismatch. The agent secret doesn't match the stored commitment. ` +
      `This can happen if the master secret is different. Original error: ${error instanceof Error ? error.message : error}`
    );
  }

  // Generate UltraHonk proof with verifierTarget for recursive proving
  let proofData;
  try {
    proofData = await backend.generateProof(witness, {
      verifierTarget: "noir-recursive-no-zk",
    });
  } catch (error) {
    console.error("[browser-prover] Proof generation failed:", error);
    throw new Error(
      `ZK proof generation failed: ${error instanceof Error ? error.message : error}`
    );
  }

  return {
    proof: proofData.proof,
    publicInputs: proofData.publicInputs,
  };
}

/**
 * Convert proof bytes to field elements
 *
 * UltraHonk proofs are already field-aligned (32 bytes per field).
 * This is a workaround for bb.js returning empty proofAsFields.
 * See: https://github.com/noir-lang/noir/issues/5661
 */
function proofBytesToFields(proof: Uint8Array): string[] {
  if (proof.length % 32 !== 0) {
    throw new Error(`Proof length ${proof.length} is not 32-byte aligned`);
  }

  const fields: string[] = [];
  for (let i = 0; i < proof.length; i += 32) {
    const chunk = proof.slice(i, i + 32);
    // Convert to 0x-prefixed hex string (big-endian)
    const hex = "0x" + Array.from(chunk)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    fields.push(hex);
  }
  return fields;
}

/**
 * Generate recursive proof artifacts for Solana submission
 *
 * Converts the UltraHonk proof into a format suitable for
 * recursive verification on Solana via Sunspot.
 *
 * Note: bb.js 3.x has a known issue where generateRecursiveProofArtifacts
 * returns empty proofAsFields. We work around this by manually converting
 * the proof bytes to fields.
 *
 * @param proof - Raw proof bytes from generateOwnershipProofBrowser
 * @param numPublicInputs - Number of public inputs in the proof (unused, kept for API compat)
 * @returns Recursive artifacts with proof as fields and VK hash
 */
export async function generateRecursiveArtifacts(
  proof: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  numPublicInputs: number = 1
): Promise<RecursiveArtifacts> {
  if (!cachedBackend) {
    await initBrowserProver();
  }

  const backend = cachedBackend!;

  // Get VK artifacts from bb.js (these work correctly)
  const artifacts = await backend.generateRecursiveProofArtifacts(
    proof,
    numPublicInputs,
    { verifierTarget: "noir-recursive-no-zk" }
  );

  // Manually convert proof bytes to fields (workaround for bb.js issue)
  const proofAsFields = proofBytesToFields(proof);

  return {
    proofAsFields,
    vkAsFields: artifacts.vkAsFields,
    vkHash: artifacts.vkHash,
  };
}

/**
 * Verify a proof locally (for testing)
 *
 * @param proof - Proof bytes
 * @param publicInputs - Public inputs
 * @returns True if valid
 */
export async function verifyProofBrowser(
  proof: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  if (!cachedBackend) {
    await initBrowserProver();
  }

  const backend = cachedBackend!;
  return backend.verifyProof(
    { proof, publicInputs },
    { verifierTarget: "noir-recursive-no-zk" }
  );
}

/**
 * Verify Poseidon hash compatibility between SDK and Noir circuit
 *
 * Runs a test with known values to ensure the hash functions match.
 * Call this at app startup to detect Poseidon mismatches early.
 *
 * @returns True if hashes match, throws if they don't
 */
export async function verifyPoseidonCompatibility(): Promise<boolean> {
  // Lazy initialize
  if (!cachedNoir) {
    await initBrowserProver();
  }

  const noir = cachedNoir!;

  // Test with a known value - if this fails, Poseidon implementations don't match
  const testSecret = BigInt("12345");

  // Import poseidon from SDK
  const { poseidon } = await import("./poseidon");
  const sdkCommitment = await poseidon([testSecret]);
  const commitmentHex = "0x" + sdkCommitment.toString(16).padStart(64, "0");

  try {
    await noir.execute({
      agent_secret: testSecret.toString(),
      commitment: commitmentHex,
    });
    return true;
  } catch (error) {
    console.error("[browser-prover] POSEIDON MISMATCH DETECTED!");
    console.error("[browser-prover] SDK and Noir use different Poseidon implementations");
    console.error("[browser-prover] Test secret:", testSecret.toString());
    console.error("[browser-prover] SDK commitment:", commitmentHex);
    throw new Error(
      "Poseidon hash mismatch: SDK and Noir circuit use incompatible Poseidon implementations. " +
      "This is a build/version issue that needs to be fixed."
    );
  }
}

/**
 * Cleanup resources
 */
export async function destroyBrowserProver(): Promise<void> {
  if (cachedApi) {
    await cachedApi.destroy();
    cachedApi = null;
    cachedBackend = null;
    cachedNoir = null;
  }
}
