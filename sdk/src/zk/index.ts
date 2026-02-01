/**
 * ZK Privacy Module
 *
 * Provides zero-knowledge proof functionality for private agent ownership:
 * - Secret derivation (deterministic from wallet signature)
 * - Proof generation (Noir + Barretenberg)
 * - Agent discovery (scan chain for matching commitments)
 */

// Poseidon hash
export { poseidon, poseidonHash, initPoseidonSync, isPoseidonReady } from "./poseidon";

// Secret derivation
export {
  deriveMasterSecret,
  deriveAgentSecrets,
  commitmentToBytes,
  bytesToCommitment,
  getSignMessage,
  MAX_AGENTS,
  type PrivateAgentSecrets,
} from "./secrets";

// Proof generation
export {
  initProver,
  isProverReady,
  generateOwnershipProof,
  proofToInstructionArgs,
  type OwnershipProof,
} from "./prover";

// Browser-based proving
export {
  initBrowserProver,
  isBrowserProverAvailable,
  generateOwnershipProofBrowser,
  generateRecursiveArtifacts,
  verifyProofBrowser,
  verifyPoseidonCompatibility,
  destroyBrowserProver,
  type BrowserProof,
  type RecursiveArtifacts,
} from "./browser-prover";

// Agent discovery
export {
  findAgentByCommitment,
  discoverPrivateAgents,
  getNextPrivateNonce,
  agentExistsForCommitment,
  type DiscoveredPrivateAgent,
} from "./discovery";
