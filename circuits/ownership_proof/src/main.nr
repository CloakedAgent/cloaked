// Ownership Proof Circuit for Cloak Private Agents
//
// Proves knowledge of agent_secret where:
//   poseidon(agent_secret) == commitment
//
// This allows an owner to prove they control a private agent
// without revealing their identity on-chain.

use dep::poseidon::poseidon::bn254::hash_1;

fn main(
    // Private input: the owner's secret for this agent
    agent_secret: Field,

    // Public input: commitment stored on-chain (verified by program)
    commitment: pub Field
) {
    // Compute the commitment from the secret
    let computed_commitment = hash_1([agent_secret]);

    // Verify it matches the expected commitment
    assert(computed_commitment == commitment);
}

#[test]
fn test_valid_proof() {
    // Test with a known secret
    let secret = 12345;
    let commitment = hash_1([secret]);

    main(secret, commitment);
}

#[test]
fn test_different_secrets_different_commitments() {
    let secret1 = 12345;
    let secret2 = 67890;

    let commitment1 = hash_1([secret1]);
    let commitment2 = hash_1([secret2]);

    // Commitments should be different
    assert(commitment1 != commitment2);
}
