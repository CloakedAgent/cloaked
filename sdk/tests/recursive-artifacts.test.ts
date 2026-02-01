import { expect } from "chai";
import {
  initBrowserProver,
  generateOwnershipProofBrowser,
  generateRecursiveArtifacts,
} from "../src/zk/browser-prover";
import { poseidonHash, initPoseidonSync } from "../src/zk/poseidon";

describe("Recursive Artifacts", function () {
  this.timeout(120000);

  before(async function () {
    await initPoseidonSync();
    await initBrowserProver();
  });

  it("should generate non-empty recursive proof artifacts", async function () {
    // Generate a browser proof first
    const agentSecret = BigInt("12345678901234567890");
    const commitment = poseidonHash([agentSecret]);

    console.log("  Generating browser proof...");
    const browserProof = await generateOwnershipProofBrowser(agentSecret, commitment);
    console.log(`  Browser proof size: ${browserProof.proof.length} bytes`);
    console.log(`  Public inputs: ${browserProof.publicInputs.length}`);

    // Generate recursive artifacts
    console.log("  Generating recursive artifacts...");
    const artifacts = await generateRecursiveArtifacts(browserProof.proof, 1);

    // Log results for debugging
    console.log(`  proofAsFields length: ${artifacts.proofAsFields.length}`);
    console.log(`  vkAsFields length: ${artifacts.vkAsFields.length}`);
    console.log(`  vkHash: ${artifacts.vkHash ? artifacts.vkHash.substring(0, 30) + "..." : "EMPTY!"}`);

    expect(artifacts.proofAsFields, "proofAsFields should not be empty").to.be.an("array");
    expect(artifacts.proofAsFields.length, "proofAsFields should have elements").to.be.greaterThan(0);

    expect(artifacts.vkAsFields, "vkAsFields should not be empty").to.be.an("array");
    expect(artifacts.vkAsFields.length, "vkAsFields should have elements").to.be.greaterThan(0);

    expect(artifacts.vkHash, "vkHash should be a non-empty string").to.be.a("string");
    expect(artifacts.vkHash.length, "vkHash should not be empty").to.be.greaterThan(0);

    // Log sample values for circuit design
    if (artifacts.proofAsFields.length > 0) {
      console.log(`  Sample proofAsFields[0]: ${artifacts.proofAsFields[0].substring(0, 30)}...`);
    }
    if (artifacts.vkAsFields.length > 0) {
      console.log(`  Sample vkAsFields[0]: ${artifacts.vkAsFields[0].substring(0, 30)}...`);
    }
  });

  it("should have consistent artifact sizes across multiple proofs", async function () {
    const secrets = [
      BigInt("11111111111111111111"),
      BigInt("22222222222222222222"),
      BigInt("33333333333333333333"),
    ];

    const sizes: { proof: number; vk: number }[] = [];

    for (const secret of secrets) {
      const commitment = poseidonHash([secret]);
      const browserProof = await generateOwnershipProofBrowser(secret, commitment);
      const artifacts = await generateRecursiveArtifacts(browserProof.proof, 1);

      sizes.push({
        proof: artifacts.proofAsFields.length,
        vk: artifacts.vkAsFields.length,
      });
    }

    console.log("  Artifact sizes across proofs:");
    sizes.forEach((s, i) => {
      console.log(`    Proof ${i + 1}: proofAsFields=${s.proof}, vkAsFields=${s.vk}`);
    });

    // All sizes should be consistent (same circuit = same artifact sizes)
    expect(sizes[0].proof).to.equal(sizes[1].proof);
    expect(sizes[0].proof).to.equal(sizes[2].proof);
    expect(sizes[0].vk).to.equal(sizes[1].vk);
    expect(sizes[0].vk).to.equal(sizes[2].vk);
  });
});
