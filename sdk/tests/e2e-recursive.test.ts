import { expect } from "chai";
import {
  initBrowserProver,
  generateOwnershipProofBrowser,
  generateRecursiveArtifacts,
} from "../src/zk/browser-prover";
import { poseidonHash, initPoseidonSync } from "../src/zk/poseidon";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3645";

interface ProverStatus {
  ready: boolean;
  error?: string;
}

interface RecursiveProofResult {
  proofBytes: number[];
  witnessBytes: number[];
}

interface ErrorResponse {
  error?: string;
  details?: string;
}

describe("E2E Recursive Proving", function () {
  // Recursive proving can take a while (large circuit)
  this.timeout(600000); // 10 minutes

  before(async function () {
    await initPoseidonSync();
    await initBrowserProver();
  });

  it("should check recursive prover status", async function () {
    try {
      const response = await fetch(`${BACKEND_URL}/api/prover/recursive/status`);

      if (!response.ok) {
        console.log("Backend not running or recursive prover not ready");
        this.skip();
        return;
      }

      const status = (await response.json()) as ProverStatus;
      console.log("Recursive prover status:", status);

      if (!status.ready) {
        console.log("Recursive prover not ready:", status.error);
        this.skip();
        return;
      }

      expect(status.ready).to.be.true;
    } catch (error) {
      console.log("Backend not reachable:", (error as Error).message);
      this.skip();
    }
  });

  it("should generate end-to-end recursive proof", async function () {
    // Check backend is available
    try {
      const statusRes = await fetch(`${BACKEND_URL}/api/prover/recursive/status`);
      if (!statusRes.ok) {
        this.skip();
        return;
      }
      const status = (await statusRes.json()) as ProverStatus;
      if (!status.ready) {
        this.skip();
        return;
      }
    } catch {
      this.skip();
      return;
    }

    // Step 1: Generate test values
    const agentSecret = BigInt("12345678901234567890123456789012345678901234567890");
    const commitment = poseidonHash([agentSecret]);

    console.log("\n  Step 1: Generate browser UltraHonk proof...");
    const startBrowser = Date.now();
    const browserProof = await generateOwnershipProofBrowser(agentSecret, commitment);
    const browserTime = Date.now() - startBrowser;
    console.log(`    Browser proof generated in ${browserTime}ms`);
    console.log(`    Proof size: ${browserProof.proof.length} bytes (${browserProof.proof.length / 32} fields)`);

    // Step 2: Extract recursive artifacts
    console.log("\n  Step 2: Extract recursive artifacts...");
    const artifacts = await generateRecursiveArtifacts(browserProof.proof, 1);
    console.log(`    proofAsFields: ${artifacts.proofAsFields.length} fields`);
    console.log(`    vkAsFields: ${artifacts.vkAsFields.length} fields`);
    console.log(`    vkHash: ${artifacts.vkHash.substring(0, 20)}...`);

    // Validate sizes match what recursive circuit expects
    expect(artifacts.proofAsFields.length).to.equal(457, "Proof should be 457 fields (non-ZK)");
    expect(artifacts.vkAsFields.length).to.equal(115, "VK should be 115 fields");

    // Step 3: Call backend recursive prover
    console.log("\n  Step 3: Send to backend /api/prove/recursive...");
    const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

    const startBackend = Date.now();
    const response = await fetch(`${BACKEND_URL}/api/prove/recursive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verificationKey: artifacts.vkAsFields,
        proof: artifacts.proofAsFields,
        vkHash: artifacts.vkHash,
        commitment: commitmentHex,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: "Unknown" }))) as ErrorResponse;
      console.log("    Backend error:", error);
      throw new Error(`Backend failed: ${error.error || error.details}`);
    }

    const result = (await response.json()) as RecursiveProofResult;
    const backendTime = Date.now() - startBackend;

    console.log(`    Backend proof generated in ${backendTime}ms`);
    console.log(`    Groth16 proofBytes: ${result.proofBytes.length} bytes`);
    console.log(`    witnessBytes: ${result.witnessBytes.length} bytes`);

    // Step 4: Validate output
    expect(result.proofBytes).to.be.an("array");
    expect(result.proofBytes.length).to.equal(324, "Groth16 proof should be 324 bytes");
    expect(result.witnessBytes).to.be.an("array");
    expect(result.witnessBytes.length).to.be.greaterThan(0);

    console.log("\n  ✅ End-to-end recursive proving successful!");
    console.log(`    Total time: ${browserTime + backendTime}ms`);
    console.log(`    - Browser (UltraHonk): ${browserTime}ms`);
    console.log(`    - Backend (Groth16): ${backendTime}ms`);
  });
});
