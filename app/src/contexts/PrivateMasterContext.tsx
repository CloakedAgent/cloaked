"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { CLOAKED_PROGRAM_ID, CLOAKED_AGENT_STATE_SIZE } from "@/lib/constants";
import type { AgentToken } from "@/hooks/useAgentTokens";

// Sign message for deriving master secret
const SIGN_MESSAGE = "Cloak Private Agent";

// Maximum agents to scan
const MAX_AGENTS = 100;

// Commitment offset for PRIVATE MODE (owner = None)
const COMMITMENT_OFFSET = 9;

// ============================================
// Session Encryption for Master Secret (H-4)
// ============================================

// Session encryption key (generated once per session, never stored)
let sessionKey: CryptoKey | null = null;
let encryptionIv: Uint8Array | null = null;

async function getOrCreateSessionKey(): Promise<CryptoKey> {
  if (!sessionKey) {
    sessionKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // not extractable
      ["encrypt", "decrypt"]
    );
    encryptionIv = crypto.getRandomValues(new Uint8Array(12));
  }
  return sessionKey;
}

function bigintToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return bytes;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value;
}

async function encryptMasterSecret(secret: bigint): Promise<ArrayBuffer> {
  const key = await getOrCreateSessionKey();
  const data = bigintToBytes(secret);
  return crypto.subtle.encrypt(
    { name: "AES-GCM", iv: encryptionIv! } as AesGcmParams,
    key,
    data as BufferSource
  );
}

async function decryptMasterSecret(encrypted: ArrayBuffer): Promise<bigint> {
  const key = await getOrCreateSessionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encryptionIv! } as AesGcmParams,
    key,
    encrypted
  );
  return bytesToBigint(new Uint8Array(decrypted));
}

function clearSessionKey(): void {
  sessionKey = null;
  encryptionIv = null;
}

/** Private agent with additional secret data for management */
export interface PrivateAgent extends AgentToken {
  nonce: number;
  agentSecret: bigint;
  commitment: bigint;
}

interface PrivateMasterContextType {
  /** @deprecated Use hasMasterSecret for checks and getMasterSecret() for value */
  masterSecret: bigint | null;
  /** Quick check if master secret is available (no async needed) */
  hasMasterSecret: boolean;
  /** Get the decrypted master secret (async) */
  getMasterSecret: () => Promise<bigint | null>;
  isSignatureRequested: boolean;
  deriveMaster: () => Promise<bigint | null>;
  clearMaster: () => void;
  // Private agents state
  privateAgents: PrivateAgent[];
  privateLoading: boolean;
  privateError: string | null;
  refreshPrivateAgents: () => void;
}

const PrivateMasterContext = createContext<PrivateMasterContextType>({
  masterSecret: null,
  hasMasterSecret: false,
  getMasterSecret: async () => null,
  isSignatureRequested: false,
  deriveMaster: async () => null,
  clearMaster: () => {},
  privateAgents: [],
  privateLoading: false,
  privateError: null,
  refreshPrivateAgents: () => {},
});

export const usePrivateMaster = () => useContext(PrivateMasterContext);

/** Derive master secret from wallet signature */
async function deriveMasterSecret(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<bigint> {
  const message = new TextEncoder().encode(SIGN_MESSAGE);
  const signature = await signMessage(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(signature));
  const hashArray = new Uint8Array(hashBuffer);
  let masterSecret = BigInt(0);
  for (let i = 0; i < 31; i++) {
    masterSecret = (masterSecret << BigInt(8)) | BigInt(hashArray[i]);
  }
  return masterSecret;
}

// Lazy-loaded poseidon function
let poseidonFn: ((inputs: bigint[]) => Promise<bigint>) | null = null;

async function loadPoseidon() {
  if (poseidonFn) return poseidonFn;
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  poseidonFn = async (inputs: bigint[]): Promise<bigint> => {
    const hash = poseidon(inputs.map((i) => F.e(i)));
    return BigInt(F.toString(hash));
  };
  return poseidonFn;
}

/** Derive agent secrets for a nonce */
async function deriveAgentSecrets(
  masterSecret: bigint,
  nonce: number
): Promise<{ agentSecret: bigint; commitment: bigint }> {
  const poseidon = await loadPoseidon();
  const agentSecret = await poseidon([masterSecret, BigInt(nonce)]);
  const commitment = await poseidon([agentSecret]);
  return { agentSecret, commitment };
}

/** Convert commitment to bytes */
function commitmentToBytes(commitment: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let value = commitment;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return bytes;
}

/** Parse agent state from raw account data */
function parseAgentState(
  data: Buffer,
  address: PublicKey,
  balance: number,
  nonce: number,
  agentSecret: bigint,
  commitment: bigint
): PrivateAgent {
  let offset = 8;

  const ownerDiscriminant = data.readUInt8(offset);
  offset += 1;
  let owner: PublicKey | null = null;
  if (ownerDiscriminant === 1) {
    owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
  }

  const ownerCommitment = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const delegate = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const maxPerTx = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const dailyLimit = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const totalLimit = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const expiresAtRaw = Number(data.readBigInt64LE(offset));
  const expiresAt = expiresAtRaw > 0 ? new Date(expiresAtRaw * 1000) : null;
  offset += 8;
  const frozen = data.readUInt8(offset) === 1;
  offset += 1;

  const totalSpent = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const dailySpent = Number(data.readBigUInt64LE(offset));
  offset += 8;
  offset += 8; // skip last_day
  offset += 1; // skip bump

  const createdAtRaw = Number(data.readBigInt64LE(offset));
  const createdAt = new Date(createdAtRaw * 1000);

  let status: "active" | "frozen" | "expired" = "active";
  if (frozen) {
    status = "frozen";
  } else if (expiresAt && expiresAt.getTime() < Date.now()) {
    status = "expired";
  }

  const dailyRemaining = dailyLimit > 0 ? Math.max(0, dailyLimit - dailySpent) : -1;
  const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - totalSpent) : -1;

  return {
    address,
    owner,
    ownerCommitment,
    delegate,
    balance,
    constraints: { maxPerTx, dailyLimit, totalLimit, expiresAt, frozen },
    spending: { totalSpent, dailySpent, dailyRemaining, totalRemaining },
    status,
    createdAt,
    isPrivate: owner === null,
    nonce,
    agentSecret,
    commitment,
  };
}

export function PrivateMasterProvider({ children }: { children: ReactNode }) {
  const { signMessage, publicKey } = useWallet();
  const { connection } = useConnection();
  // Store encrypted master secret instead of plaintext
  const [encryptedMaster, setEncryptedMaster] = useState<ArrayBuffer | null>(null);
  const [isSignatureRequested, setIsSignatureRequested] = useState(false);
  const [lastWallet, setLastWallet] = useState<string | null>(null);

  // Private agents state (centralized)
  const [privateAgents, setPrivateAgents] = useState<PrivateAgent[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const abortRef = useRef(false);

  const currentWallet = publicKey?.toBase58() ?? null;

  // Clear state if wallet changes
  if (currentWallet !== lastWallet) {
    if (encryptedMaster !== null) {
      setEncryptedMaster(null);
      clearSessionKey();
    }
    if (privateAgents.length > 0) {
      setPrivateAgents([]);
    }
    setLastWallet(currentWallet);
  }

  // Async getter for decrypted master secret
  const getMasterSecret = useCallback(async (): Promise<bigint | null> => {
    if (!encryptedMaster) return null;
    return decryptMasterSecret(encryptedMaster);
  }, [encryptedMaster]);

  // Discover private agents
  const discoverAgents = useCallback(
    async (secret: bigint) => {
      if (isFetchingRef.current) {
        return;
      }

      abortRef.current = false;
      isFetchingRef.current = true;
      setPrivateLoading(true);
      setPrivateError(null);

      try {
        // Pre-compute all possible commitments
        const commitmentMap = new Map<string, { nonce: number; agentSecret: bigint; commitment: bigint }>();

        for (let nonce = 0; nonce < MAX_AGENTS; nonce++) {
          if (abortRef.current) break;
          const { agentSecret, commitment } = await deriveAgentSecrets(secret, nonce);
          const commitmentHex = Buffer.from(commitmentToBytes(commitment)).toString('hex');
          commitmentMap.set(commitmentHex, { nonce, agentSecret, commitment });
        }

        // Fetch ALL private CloakedAgentState accounts in ONE RPC call
        const allAccounts = await connection.getProgramAccounts(
          CLOAKED_PROGRAM_ID,
          {
            filters: [
              { dataSize: CLOAKED_AGENT_STATE_SIZE },
              { memcmp: { offset: 8, bytes: bs58.encode(Buffer.from([0])) } },
            ],
          }
        );

        // Match accounts against our commitments
        const matched: Array<{
          pubkey: PublicKey;
          data: Buffer;
          vaultPda: PublicKey;
          match: { nonce: number; agentSecret: bigint; commitment: bigint };
        }> = [];

        for (const { pubkey, account } of allAccounts) {
          if (abortRef.current) break;

          const data = account.data as Buffer;
          const commitmentBytes = data.slice(COMMITMENT_OFFSET, COMMITMENT_OFFSET + 32);
          const commitmentHex = Buffer.from(commitmentBytes).toString('hex');

          const match = commitmentMap.get(commitmentHex);
          if (match) {
            const [vaultPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("vault"), pubkey.toBuffer()],
              CLOAKED_PROGRAM_ID
            );
            matched.push({ pubkey, data, vaultPda, match });
          }
        }

        // Batch fetch all vault balances in ONE RPC call
        const vaultPdas = matched.map(m => m.vaultPda);
        const balanceResults = vaultPdas.length > 0
          ? await connection.getMultipleAccountsInfo(vaultPdas)
          : [];

        // Build discovered array with fetched balances
        const discovered: PrivateAgent[] = matched.map((m, i) => {
          const balance = balanceResults[i]?.lamports ?? 0;
          return parseAgentState(
            m.data,
            m.pubkey,
            balance,
            m.match.nonce,
            m.match.agentSecret,
            m.match.commitment
          );
        });

        // Sort by creation date (newest first)
        discovered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (!abortRef.current) {
          setPrivateAgents(discovered);
        }
      } catch (err) {
        if (!abortRef.current) {
          console.error("Failed to discover private agents:", err);
          setPrivateError(err instanceof Error ? err.message : "Failed to discover agents");
        }
      } finally {
        isFetchingRef.current = false;
        if (!abortRef.current) {
          setPrivateLoading(false);
        }
      }
    },
    [connection]
  );

  // Fetch agents when master secret is set
  useEffect(() => {
    if (encryptedMaster) {
      decryptMasterSecret(encryptedMaster).then(secret => {
        discoverAgents(secret);
      });
    }
  }, [encryptedMaster, discoverAgents]);

  const deriveMaster = useCallback(async (): Promise<bigint | null> => {
    if (!signMessage) return null;

    // Return cached secret if available (decrypt it)
    if (encryptedMaster !== null) {
      return decryptMasterSecret(encryptedMaster);
    }

    try {
      setIsSignatureRequested(true);
      const secret = await deriveMasterSecret(signMessage);
      // Encrypt before storing
      const encrypted = await encryptMasterSecret(secret);
      setEncryptedMaster(encrypted);
      return secret;
    } catch (err) {
      console.error("Failed to derive master secret:", err);
      return null;
    } finally {
      setIsSignatureRequested(false);
    }
  }, [signMessage, encryptedMaster]);

  const clearMaster = useCallback(() => {
    setEncryptedMaster(null);
    setPrivateAgents([]);
    clearSessionKey(); // Clear the session encryption key too
  }, []);

  const refreshPrivateAgents = useCallback(() => {
    if (encryptedMaster) {
      decryptMasterSecret(encryptedMaster).then(secret => {
        discoverAgents(secret);
      });
    }
  }, [encryptedMaster, discoverAgents]);

  return (
    <PrivateMasterContext.Provider
      value={{
        // Deprecated: always null for security - use hasMasterSecret and getMasterSecret
        masterSecret: null,
        hasMasterSecret: encryptedMaster !== null,
        getMasterSecret,
        isSignatureRequested,
        deriveMaster,
        clearMaster,
        privateAgents,
        privateLoading,
        privateError,
        refreshPrivateAgents,
      }}
    >
      {children}
    </PrivateMasterContext.Provider>
  );
}
