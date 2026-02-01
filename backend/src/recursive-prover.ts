/**
 * Recursive ZK Proof Generation Service
 *
 * Verifies an UltraHonk proof inside a recursive circuit and generates
 * a Groth16 proof for Solana submission. This allows the browser to
 * generate proofs (where the secret stays local) while still producing
 * Groth16 proofs that Solana can verify.
 *
 * Flow:
 * 1. Browser generates UltraHonk proof (secret stays local)
 * 2. Browser extracts proof-as-fields + VK-as-fields
 * 3. This service verifies the UltraHonk proof in a recursive circuit
 * 4. Outputs Groth16 proof that Solana can verify
 *
 * Privacy: The agent_secret NEVER reaches this service - only the proof does.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

// Paths to Sunspot toolchain
const NARGO_PATH = process.env.NARGO_PATH || path.join(os.homedir(), ".nargo/bin/nargo");
const SUNSPOT_PATH = process.env.SUNSPOT_PATH || path.join(os.homedir(), "bin/sunspot");

// Recursive verifier circuit artifacts
const RECURSIVE_CIRCUITS_DIR = path.join(__dirname, "../circuits/recursive_verifier");

/** Input for recursive proof generation */
export interface RecursiveProofInput {
  /** Verification key as field elements (115 fields) */
  verificationKey: string[];
  /** UltraHonk proof as field elements (457 fields for non-ZK) */
  proof: string[];
  /** VK hash for binding (hex with 0x prefix) */
  vkHash: string;
  /** Public commitment (hex with 0x prefix) */
  commitment: string;
}

/** Recursive proof output for Solana program */
export interface RecursiveProofOutput {
  /** Full Groth16 proof bytes (324 bytes for gnark) */
  proofBytes: number[];
  /** Full public witness bytes (12-byte header + inputs) */
  witnessBytes: number[];
}

/**
 * Generate recursive Groth16 proof from UltraHonk proof artifacts
 *
 * @param input - UltraHonk proof artifacts from browser
 * @returns Groth16 proof ready for Solana program
 */
export async function generateRecursiveProof(
  input: RecursiveProofInput
): Promise<RecursiveProofOutput> {
  // Validate input sizes
  if (input.verificationKey.length !== 115) {
    throw new Error(`Verification key must have 115 fields, got ${input.verificationKey.length}`);
  }
  if (input.proof.length !== 457) {
    throw new Error(`Proof must have 457 fields, got ${input.proof.length}`);
  }

  // Create temp directory for this proof generation
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cloak-recursive-"));

  try {
    // Copy circuit files to temp directory
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "target"), { recursive: true });

    await fs.copyFile(
      path.join(RECURSIVE_CIRCUITS_DIR, "Nargo.toml"),
      path.join(tempDir, "Nargo.toml")
    );
    await fs.copyFile(
      path.join(RECURSIVE_CIRCUITS_DIR, "src/main.nr"),
      path.join(tempDir, "src/main.nr")
    );
    await fs.copyFile(
      path.join(RECURSIVE_CIRCUITS_DIR, "target/recursive_verifier.json"),
      path.join(tempDir, "target/recursive_verifier.json")
    );
    await fs.copyFile(
      path.join(RECURSIVE_CIRCUITS_DIR, "target/recursive_verifier.ccs"),
      path.join(tempDir, "target/recursive_verifier.ccs")
    );
    await fs.copyFile(
      path.join(RECURSIVE_CIRCUITS_DIR, "target/recursive_verifier.pk"),
      path.join(tempDir, "target/recursive_verifier.pk")
    );

    // Write Prover.toml with inputs
    const proverToml = generateProverToml(input);
    await fs.writeFile(path.join(tempDir, "Prover.toml"), proverToml);

    // Step 1: Generate witness with nargo execute
    console.log("[recursive-prover] Generating witness...");
    await execFileAsync(NARGO_PATH, ["execute"], {
      cwd: tempDir,
      timeout: 120000, // Longer timeout for recursive circuit
    });

    // Step 2: Generate Groth16 proof with sunspot prove
    console.log("[recursive-prover] Generating Groth16 proof...");
    await execFileAsync(
      SUNSPOT_PATH,
      [
        "prove",
        "target/recursive_verifier.json",
        "target/recursive_verifier.gz",
        "target/recursive_verifier.ccs",
        "target/recursive_verifier.pk",
      ],
      {
        cwd: tempDir,
        timeout: 300000, // 5 minutes for large circuit
      }
    );

    // Step 3: Read proof and public witness files
    const proofBytes = await fs.readFile(path.join(tempDir, "target/recursive_verifier.proof"));
    const witnessBytes = await fs.readFile(path.join(tempDir, "target/recursive_verifier.pw"));

    console.log(`[recursive-prover] Proof generated: ${proofBytes.length} bytes`);

    return {
      proofBytes: Array.from(proofBytes),
      witnessBytes: Array.from(witnessBytes),
    };
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("[recursive-prover] Failed to clean up temp directory:", e);
    }
  }
}

/**
 * Generate Prover.toml content for recursive verifier circuit
 *
 * The circuit expects:
 * - verification_key: [Field; 115]
 * - proof: [Field; 457]
 * - vk_hash: Field
 * - commitment: pub Field
 */
function generateProverToml(input: RecursiveProofInput): string {
  const lines: string[] = [];

  // Verification key as array
  lines.push(`verification_key = [${input.verificationKey.map(f => `"${f}"`).join(", ")}]`);

  // Proof as array
  lines.push(`proof = [${input.proof.map(f => `"${f}"`).join(", ")}]`);

  // VK hash
  lines.push(`vk_hash = "${input.vkHash}"`);

  // Commitment (public input)
  lines.push(`commitment = "${input.commitment}"`);

  return lines.join("\n") + "\n";
}

/**
 * Verify that the recursive prover toolchain is available
 */
export async function verifyRecursiveProverSetup(): Promise<{ ready: boolean; error?: string }> {
  try {
    // Check nargo
    await execFileAsync(NARGO_PATH, ["--version"], { timeout: 5000 });

    // Check sunspot
    await execFileAsync(SUNSPOT_PATH, ["--help"], { timeout: 5000 });

    // Check recursive circuit artifacts
    const requiredFiles = [
      "Nargo.toml",
      "src/main.nr",
      "target/recursive_verifier.json",
      "target/recursive_verifier.ccs",
      "target/recursive_verifier.pk",
    ];

    for (const file of requiredFiles) {
      await fs.access(path.join(RECURSIVE_CIRCUITS_DIR, file));
    }

    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
