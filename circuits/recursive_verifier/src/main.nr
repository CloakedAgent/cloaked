// Recursive Verifier Circuit for Cloaked Private Agents
//
// Verifies an UltraHonk proof of ownership without knowing the secret.
// The browser generates UltraHonk proof, this circuit wraps it to verify
// the proof is valid without revealing the underlying secret.
//
// Flow:
//   1. Browser: poseidon(agent_secret) == commitment -> UltraHonk proof
//   2. This circuit: verify(proof, vk, commitment) -> valid/invalid
//   3. Sunspot: compile this circuit -> Groth16 for Solana
//
// The agent_secret NEVER leaves the browser. Only the proof is submitted.
//
// NOTE: Using non-ZK UltraHonk (verify_honk_proof_non_zk) because Sunspot
// does not yet support recursive aggregation of ZK proofs (proof type 6).
// This is acceptable for our use case as the inner proof still provides
// privacy for the agent_secret - the outer proof is just for verification.

use dep::bb_proof_verification::{
    verify_honk_proof_non_zk,
    UltraHonkVerificationKey,
    UltraHonkProof,
};

fn main(
    // Private inputs (visible to backend prover, but NOT the agent_secret)
    verification_key: UltraHonkVerificationKey,  // 115 fields - VK for ownership_proof circuit
    proof: UltraHonkProof,                       // 457 fields - UltraHonk proof from browser
    vk_hash: Field,                              // Hash of VK for binding

    // Public input (verified on-chain by Solana program)
    commitment: pub Field                        // The ownership commitment being proven
) {
    // Verify the UltraHonk proof!
    // This asserts that someone knows agent_secret where poseidon(agent_secret) == commitment
    // without revealing what agent_secret is.
    verify_honk_proof_non_zk(
        verification_key,
        proof,
        [commitment],  // Public inputs from inner circuit
        vk_hash
    );
}

#[test]
fn test_circuit_compiles() {
    // This test just verifies the circuit compiles.
    // Actual proof verification requires real proof data.
    // The circuit will be tested via integration tests with browser proofs.
}
