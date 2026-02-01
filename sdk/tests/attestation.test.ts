import { expect } from "chai";
import {
  initBrowserProver,
  generateOwnershipProofBrowser,
} from "../src/zk/browser-prover";
import { poseidonHash, initPoseidonSync } from "../src/zk/poseidon";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3645";

interface AttestationStatus {
  ready: boolean;
  error?: string;
}

interface AttestationResult {
  proofBytes: number[];
  witnessBytes: number[];
}

interface ErrorResponse {
  error?: string;
  details?: string;
}

describe("Attestation Prover", function () {
  this.timeout(120000);

  before(async function () {
    await initPoseidonSync();
    await initBrowserProver();
  });

  it("should check attestation prover status", async function () {
    try {
      const response = await fetch(`${BACKEND_URL}/api/prover/attestation/status`);

      if (!response.ok) {
        console.log("Backend not running or attestation prover not ready");
        this.skip();
        return;
      }

      const status = (await response.json()) as AttestationStatus;
      console.log("Attestation prover status:", status);

      if (!status.ready) {
        console.log("Attestation prover not ready:", status.error);
        this.skip();
        return;
      }

      expect(status.ready).to.be.true;
    } catch (error) {
      console.log("Backend not reachable:", (error as Error).message);
      this.skip();
    }
  });

  it("should generate attestation proof from UltraHonk", async function () {
    // Check backend is available
    try {
      const statusRes = await fetch(`${BACKEND_URL}/api/prover/attestation/status`);
      if (!statusRes.ok) {
        this.skip();
        return;
      }
      const status = (await statusRes.json()) as AttestationStatus;
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
    console.log(`    Proof size: ${browserProof.proof.length} bytes`);
    console.log(`    Public inputs: ${browserProof.publicInputs.length}`);

    // Step 2: Send to attestation endpoint
    console.log("\n  Step 2: Send to backend /api/prove/attestation...");
    const startBackend = Date.now();
    const response = await fetch(`${BACKEND_URL}/api/prove/attestation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofBytes: Array.from(browserProof.proof),
        publicInputs: browserProof.publicInputs,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: "Unknown" }))) as ErrorResponse;
      console.log("    Backend error:", error);
      throw new Error(`Backend failed: ${error.error || error.details}`);
    }

    const result = (await response.json()) as AttestationResult;
    const backendTime = Date.now() - startBackend;

    console.log(`    Backend attestation in ${backendTime}ms`);
    console.log(`    Groth16 proofBytes: ${result.proofBytes.length} bytes`);
    console.log(`    witnessBytes: ${result.witnessBytes.length} bytes`);

    // Step 3: Validate output
    expect(result.proofBytes).to.be.an("array");
    expect(result.proofBytes.length).to.equal(324, "Groth16 proof should be 324 bytes");
    expect(result.witnessBytes).to.be.an("array");
    expect(result.witnessBytes.length).to.be.greaterThan(0);

    console.log("\n  ✅ Attestation proof generated successfully!");
    console.log(`    Total time: ${browserTime + backendTime}ms`);
    console.log(`    - Browser (UltraHonk): ${browserTime}ms`);
    console.log(`    - Backend (Groth16): ${backendTime}ms`);
    console.log(`    - Secret stayed in browser: YES ✓`);
  });
});
