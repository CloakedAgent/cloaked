export { CloakedAgent } from "./agent";
export { CLOAKED_PROGRAM_ID, ZK_VERIFIER_PROGRAM_ID } from "./constants";
export * from "./types";
export { Signer, keypairToSigner } from "./signer";

// SDK configuration - MUST call setBackendUrl in browser environments
export { setBackendUrl, getBackendUrl, isBackendUrlConfigured } from "./config";

// Relayer module (Truly Private Agent Creation & Operations)
export {
  createPrivateAgentViaRelayer,
  getRelayerStatus,
  freezePrivateViaRelayer,
  unfreezePrivateViaRelayer,
  updateConstraintsPrivateViaRelayer,
  withdrawPrivateViaRelayer,
  closePrivateViaRelayer,
  type CreatePrivateViaRelayerOptions,
  type CreatePrivateViaRelayerResult,
  type RelayerStatus,
  type PrivateOperationParams,
  type UpdateConstraintsPrivateParams,
  type WithdrawPrivateParams,
  type ClosePrivateParams,
} from "./relayer";

// ZK Privacy module
export {
  // Poseidon hash
  poseidon,
  poseidonHash,
  initPoseidonSync,
  isPoseidonReady,
  // Secret derivation
  deriveMasterSecret,
  deriveAgentSecrets,
  commitmentToBytes,
  bytesToCommitment,
  getSignMessage,
  MAX_AGENTS,
  // Proof generation
  initProver,
  isProverReady,
  generateOwnershipProof,
  proofToInstructionArgs,
  // Discovery
  findAgentByCommitment,
  discoverPrivateAgents,
  getNextPrivateNonce,
  agentExistsForCommitment,
} from "./zk";
export type { PrivateAgentSecrets, OwnershipProof, DiscoveredPrivateAgent } from "./zk";

// MCP types (for programmatic use)
export type {
  BalanceResponse,
  StatusResponse,
  PayResponse,
} from "./mcp/types";

// Note: runMcpServer is available via "@cloakedagent/sdk/mcp" subpath import
// Not exported here to avoid pulling Node.js deps into browser bundles
