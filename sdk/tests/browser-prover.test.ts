import { expect } from "chai";
import {
  initBrowserProver,
  generateOwnershipProofBrowser,
  verifyProofBrowser,
  isBrowserProverAvailable,
} from "../src/zk/browser-prover";
import { poseidonHash, initPoseidonSync } from "../src/zk/poseidon";

describe("Browser Prover", function () {
  // Proof generation can be slow
  this.timeout(120000);

  before(async function () {
    // Initialize poseidon for computing expected commitment
    await initPoseidonSync();
  });

  describe("isBrowserProverAvailable", () => {
    it("should return false in Node.js environment", () => {
      // Node.js has SharedArrayBuffer but no document
      const available = isBrowserProverAvailable();
      expect(available).to.be.false;
    });
  });

  describe("initBrowserProver", () => {
    it("should initialize without error", async function () {
      await initBrowserProver();
      // If we get here without throwing, initialization succeeded
    });
  });

  describe("generateOwnershipProofBrowser", () => {
    it("should generate a valid proof", async function () {
      // Test values
      const agentSecret = BigInt("12345678901234567890");

      // Compute commitment = poseidon([agentSecret])
      const commitment = poseidonHash([agentSecret]);

      // Generate proof
      const proof = await generateOwnershipProofBrowser(agentSecret, commitment);

      // Verify proof structure
      expect(proof).to.have.property("proof");
      expect(proof).to.have.property("publicInputs");
      expect(proof.proof).to.be.instanceOf(Uint8Array);
      expect(proof.proof.length).to.be.greaterThan(0);
      expect(proof.publicInputs).to.be.an("array");

      console.log(`  Proof size: ${proof.proof.length} bytes`);
      console.log(`  Public inputs: ${proof.publicInputs.length}`);
    });

    it("should verify the generated proof", async function () {
      const agentSecret = BigInt("98765432109876543210");
      const commitment = poseidonHash([agentSecret]);

      const proof = await generateOwnershipProofBrowser(agentSecret, commitment);
      const isValid = await verifyProofBrowser(proof.proof, proof.publicInputs);

      expect(isValid).to.be.true;
    });

    it("should fail verification with wrong public inputs", async function () {
      const agentSecret = BigInt("11111111111111111111");
      const commitment = poseidonHash([agentSecret]);

      const proof = await generateOwnershipProofBrowser(agentSecret, commitment);

      // Modify public inputs
      const wrongInputs = ["0x0000000000000000000000000000000000000000000000000000000000000001"];

      const isValid = await verifyProofBrowser(proof.proof, wrongInputs);
      expect(isValid).to.be.false;
    });
  });
});
