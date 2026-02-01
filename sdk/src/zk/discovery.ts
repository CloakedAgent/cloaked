/**
 * Private agent discovery
 *
 * Discovers private agents by scanning the blockchain for matching
 * owner_commitment values derived from the user's master secret.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  deriveAgentSecrets,
  commitmentToBytes,
  bytesToCommitment,
  MAX_AGENTS,
} from "./secrets";
import { CLOAKED_PROGRAM_ID } from "../constants";
import bs58 from "bs58";

/** Discovered private agent */
export interface DiscoveredPrivateAgent {
  /** Cloaked Agent state account address */
  address: PublicKey;
  /** Delegate public key */
  delegate: PublicKey;
  /** Vault balance in lamports */
  balance: number;
  /** Whether frozen */
  frozen: boolean;
  /** The nonce used to derive this agent */
  nonce: number;
  /** Agent secret (for generating proofs) */
  agentSecret: bigint;
  /** Commitment stored on-chain */
  commitment: bigint;
}

// CloakedAgentState layout offsets for PRIVATE MODE (owner = None)
// In Borsh, Option<Pubkey> when None is just 1 byte (discriminant only)
//
// Layout (171 bytes total):
// - discriminator: 8 bytes
// - owner discriminant: 1 byte (0 = None for private mode)
// - owner_commitment: 32 bytes (offset 9)
// - delegate: 32 bytes (offset 41)
// - max_per_tx: 8 bytes (offset 73)
// - daily_limit: 8 bytes (offset 81)
// - total_limit: 8 bytes (offset 89)
// - expires_at: 8 bytes (offset 97)
// - frozen: 1 byte (offset 105)
// - total_spent: 8 bytes (offset 106)
// - daily_spent: 8 bytes (offset 114)
// - last_day: 8 bytes (offset 122)
// - bump: 1 byte (offset 130)
// - created_at: 8 bytes (offset 131)
const CLOAKED_AGENT_STATE_SIZE = 171;
const COMMITMENT_OFFSET = 9; // After discriminator + owner discriminant (1 byte for None)
const DELEGATE_OFFSET = 9 + 32; // = 41
const FROZEN_OFFSET = 9 + 32 + 32 + 8 + 8 + 8 + 8; // = 105

/**
 * Find an agent by its owner commitment
 *
 * @param commitment - The commitment to search for
 * @param connection - Solana connection
 * @returns Agent state account or null if not found
 */
export async function findAgentByCommitment(
  commitment: bigint,
  connection: Connection
): Promise<{
  address: PublicKey;
  delegate: PublicKey;
  balance: number;
  frozen: boolean;
} | null> {
  const commitmentBytes = commitmentToBytes(commitment);

  // Query program accounts with commitment filter
  const accounts = await connection.getProgramAccounts(CLOAKED_PROGRAM_ID, {
    filters: [
      { dataSize: CLOAKED_AGENT_STATE_SIZE },
      {
        memcmp: {
          offset: COMMITMENT_OFFSET,
          bytes: bs58.encode(commitmentBytes),
        },
      },
    ],
  });

  if (accounts.length === 0) return null;

  // Parse first matching account
  const { pubkey, account } = accounts[0];
  const data = account.data;

  // Extract delegate (32 bytes at offset 41)
  const delegateBytes = data.slice(DELEGATE_OFFSET, DELEGATE_OFFSET + 32);
  const delegate = new PublicKey(delegateBytes);

  // Extract frozen (1 byte at offset 105)
  const frozen = data[FROZEN_OFFSET] === 1;

  // Get vault balance
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pubkey.toBuffer()],
    CLOAKED_PROGRAM_ID
  );
  const vaultInfo = await connection.getAccountInfo(vaultPda);
  const balance = vaultInfo?.lamports ?? 0;

  return {
    address: pubkey,
    delegate,
    balance,
    frozen,
  };
}

/**
 * Discover all private agents for a master secret
 *
 * Scans through nonces 0..MAX_AGENTS to find all agents
 * owned by this master secret.
 *
 * @param masterSecret - Master secret from wallet signature
 * @param connection - Solana connection
 * @returns Array of discovered private agents
 */
export async function discoverPrivateAgents(
  masterSecret: bigint,
  connection: Connection
): Promise<DiscoveredPrivateAgent[]> {
  const agents: DiscoveredPrivateAgent[] = [];

  for (let nonce = 0; nonce < MAX_AGENTS; nonce++) {
    const { agentSecret, commitment } = await deriveAgentSecrets(
      masterSecret,
      nonce
    );
    const agent = await findAgentByCommitment(commitment, connection);

    if (agent) {
      agents.push({
        ...agent,
        nonce,
        agentSecret,
        commitment,
      });
    } else if (nonce > 0 && agents.length > 0) {
      // Stop after first gap (assumes sequential nonces)
      // If nonce 0 doesn't exist but nonce 1+ does, keep scanning
      break;
    }
  }

  return agents;
}

/**
 * Get the next available nonce for creating a new private agent
 *
 * @param masterSecret - Master secret from wallet signature
 * @param connection - Solana connection
 * @returns Next available nonce
 */
export async function getNextPrivateNonce(
  masterSecret: bigint,
  connection: Connection
): Promise<number> {
  for (let nonce = 0; nonce < MAX_AGENTS; nonce++) {
    const { commitment } = await deriveAgentSecrets(masterSecret, nonce);
    const agent = await findAgentByCommitment(commitment, connection);

    if (!agent) {
      return nonce;
    }
  }

  throw new Error(`Maximum private agents (${MAX_AGENTS}) reached`);
}

/**
 * Check if an agent exists for a specific commitment
 *
 * @param commitment - The commitment to check
 * @param connection - Solana connection
 * @returns True if agent exists
 */
export async function agentExistsForCommitment(
  commitment: bigint,
  connection: Connection
): Promise<boolean> {
  const agent = await findAgentByCommitment(commitment, connection);
  return agent !== null;
}
