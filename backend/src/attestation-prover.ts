/**
 * Attestation Proof Service - Option 1 Hybrid Approach
 *
 * Flow:
 * 1. Browser generates UltraHonk proof (secret stays local)
 * 2. Browser sends proof + commitment to backend (NO secret!)
 * 3. Backend verifies UltraHonk proof using bb.js
 * 4. If valid, backend generates simple Groth16 "attestation" proof
 * 5. Solana verifies the Groth16 attestation proof
 *
 * Security: Agent secret NEVER leaves the browser!
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { Barretenberg, UltraHonkBackend, deflattenFields } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";

const execFileAsync = promisify(execFile);

// Paths to toolchain
const NARGO_PATH = process.env.NARGO_PATH || path.join(os.homedir(), ".nargo/bin/nargo");
const SUNSPOT_PATH = process.env.SUNSPOT_PATH || path.join(os.homedir(), "bin/sunspot");

// Circuit artifacts
const OWNERSHIP_CIRCUIT_PATH = path.join(__dirname, "../circuits/ownership_proof.json");
const ATTESTATION_CIRCUITS_DIR = path.join(__dirname, "../circuits/attestation_proof");

// Cached bb.js instances
let cachedApi: Barretenberg | null = null;
let cachedBackend: UltraHonkBackend | null = null;

/** Input for attestation proof generation */
export interface AttestationInput {
  /** UltraHonk proof bytes (base64 or array) */
  proofBytes: number[];
  /** Public inputs from the UltraHonk proof */
  publicInputs: string[];
}

/** Attestation proof output for Solana */
export interface AttestationOutput {
  /** Groth16 proof bytes (324 bytes) */
  proofBytes: number[];
  /** Public witness bytes */
  witnessBytes: number[];
}

/**
 * Initialize bb.js for UltraHonk verification
 */
async function initVerifier(): Promise<{ api: Barretenberg; backend: UltraHonkBackend }> {
  if (!cachedApi || !cachedBackend) {
    // Load ownership circuit
    const circuitJson = await fs.readFile(OWNERSHIP_CIRCUIT_PATH, "utf-8");
    const circuit = JSON.parse(circuitJson) as { bytecode: string };

    // Initialize Barretenberg
    cachedApi = await Barretenberg.new({ threads: 1 });
    cachedBackend = new UltraHonkBackend(circuit.bytecode, cachedApi);
  }

  return { api: cachedApi, backend: cachedBackend };
}

/**
 * Verify UltraHonk proof from browser
 */
export async function verifyUltraHonkProof(
  proofBytes: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  const { backend } = await initVerifier();

  try {
    const valid = await backend.verifyProof(
      { proof: proofBytes, publicInputs },
      { verifierTarget: "noir-recursive-no-zk" }
    );
    return valid;
  } catch (error) {
    console.error("[attestation-prover] UltraHonk verification failed:", error);
    return false;
  }
}

/**
 * Generate attestation Groth16 proof after verifying UltraHonk
 */
export async function generateAttestationProof(
  input: AttestationInput
): Promise<AttestationOutput> {
  const proofBytes = new Uint8Array(input.proofBytes);

  // Step 1: Verify UltraHonk proof
  console.log("[attestation-prover] Verifying UltraHonk proof...");
  const valid = await verifyUltraHonkProof(proofBytes, input.publicInputs);

  if (!valid) {
    throw new Error("UltraHonk proof verification failed");
  }

  console.log("[attestation-prover] UltraHonk proof verified! Generating attestation...");

  // Step 2: Generate cryptographically secure random nonce for attestation
  const randomBytes = crypto.randomBytes(8);
  const nonce = BigInt("0x" + randomBytes.toString("hex")) % BigInt(1e18) + 1n;

  // Step 3: Get commitment from public inputs
  const commitment = input.publicInputs[0];
  if (!commitment) {
    throw new Error("No commitment in public inputs");
  }

  // Step 4: Generate Groth16 attestation proof
  return generateGroth16Attestation(nonce, commitment);
}

/**
 * Generate Groth16 attestation proof using sunspot
 */
async function generateGroth16Attestation(
  nonce: bigint,
  commitment: string
): Promise<AttestationOutput> {
  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cloak-attestation-"));

  try {
    // Copy circuit files
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "target"), { recursive: true });

    await fs.copyFile(
      path.join(ATTESTATION_CIRCUITS_DIR, "Nargo.toml"),
      path.join(tempDir, "Nargo.toml")
    );
    await fs.copyFile(
      path.join(ATTESTATION_CIRCUITS_DIR, "src/main.nr"),
      path.join(tempDir, "src/main.nr")
    );
    await fs.copyFile(
      path.join(ATTESTATION_CIRCUITS_DIR, "target/attestation_proof.json"),
      path.join(tempDir, "target/attestation_proof.json")
    );
    await fs.copyFile(
      path.join(ATTESTATION_CIRCUITS_DIR, "target/attestation_proof.ccs"),
      path.join(tempDir, "target/attestation_proof.ccs")
    );
    await fs.copyFile(
      path.join(ATTESTATION_CIRCUITS_DIR, "target/attestation_proof.pk"),
      path.join(tempDir, "target/attestation_proof.pk")
    );

    // Write Prover.toml
    const proverToml = `nonce = "${nonce}"\ncommitment = "${commitment}"\n`;
    await fs.writeFile(path.join(tempDir, "Prover.toml"), proverToml);

    // Generate witness with nargo
    console.log("[attestation-prover] Generating witness...");
    await execFileAsync(NARGO_PATH, ["execute"], {
      cwd: tempDir,
      timeout: 30000,
    });

    // Generate Groth16 proof with sunspot
    console.log("[attestation-prover] Generating Groth16 proof...");
    await execFileAsync(
      SUNSPOT_PATH,
      [
        "prove",
        "target/attestation_proof.json",
        "target/attestation_proof.gz",
        "target/attestation_proof.ccs",
        "target/attestation_proof.pk",
      ],
      {
        cwd: tempDir,
        timeout: 30000,
      }
    );

    // Read proof and witness
    const proofBytes = await fs.readFile(path.join(tempDir, "target/attestation_proof.proof"));
    const witnessBytes = await fs.readFile(path.join(tempDir, "target/attestation_proof.pw"));

    console.log(`[attestation-prover] Attestation proof generated: ${proofBytes.length} bytes`);

    return {
      proofBytes: Array.from(proofBytes),
      witnessBytes: Array.from(witnessBytes),
    };
  } finally {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("[attestation-prover] Failed to cleanup temp dir:", e);
    }
  }
}

/**
 * Check if attestation prover is ready
 */
export async function verifyAttestationProverSetup(): Promise<{ ready: boolean; error?: string }> {
  try {
    // Check nargo
    await execFileAsync(NARGO_PATH, ["--version"], { timeout: 5000 });

    // Check sunspot
    await execFileAsync(SUNSPOT_PATH, ["--help"], { timeout: 5000 });

    // Check circuit artifacts
    const requiredFiles = [
      "Nargo.toml",
      "src/main.nr",
      "target/attestation_proof.json",
      "target/attestation_proof.ccs",
      "target/attestation_proof.pk",
    ];

    for (const file of requiredFiles) {
      await fs.access(path.join(ATTESTATION_CIRCUITS_DIR, file));
    }

    // Check ownership circuit for bb.js verification
    await fs.access(OWNERSHIP_CIRCUIT_PATH);

    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
