/**
 * Poseidon Cross-Validation (C-8)
 *
 * Verifies that circomlibjs (SDK/browser) and Noir's poseidon::bn254::hash_1
 * produce identical outputs. If these diverge, ZK proofs silently break.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { initPoseidonSync, poseidonHash } from "../src/zk/poseidon";

const execFileAsync = promisify(execFile);

const NARGO_PATH = process.env.NARGO_PATH || path.join(os.homedir(), ".nargo/bin/nargo");
const CIRCUIT_DIR = path.join(__dirname, "../../circuits/ownership_proof");

const TEST_VECTORS = [
  BigInt("1"),
  BigInt("12345"),
  BigInt("12345678901234567890123456789012345678901234567890"),
  BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495616"),
];

describe("Poseidon Cross-Validation", function () {
  this.timeout(60000);

  before(async function () {
    await initPoseidonSync();

    try {
      await execFileAsync(NARGO_PATH, ["--version"], { timeout: 5000 });
    } catch {
      console.log("nargo not available, skipping");
      this.skip();
    }
  });

  for (const secret of TEST_VECTORS) {
    const label = secret.toString().length > 20
      ? secret.toString().slice(0, 20) + "..."
      : secret.toString();

    it(`circomlibjs matches Noir for input ${label}`, async function () {
      const commitment = poseidonHash([secret]);
      const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cloak-poseidon-test-"));

      try {
        await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
        await fs.copyFile(path.join(CIRCUIT_DIR, "Nargo.toml"), path.join(tempDir, "Nargo.toml"));
        await fs.copyFile(path.join(CIRCUIT_DIR, "src/main.nr"), path.join(tempDir, "src/main.nr"));

        await fs.writeFile(
          path.join(tempDir, "Prover.toml"),
          `agent_secret = "${secret}"\ncommitment = "${commitmentHex}"\n`
        );

        // nargo execute runs the circuit — if it succeeds, the assert passed,
        // meaning Noir's hash_1([secret]) == circomlibjs poseidon([secret])
        await execFileAsync(NARGO_PATH, ["execute"], { cwd: tempDir, timeout: 30000 });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  }
});
