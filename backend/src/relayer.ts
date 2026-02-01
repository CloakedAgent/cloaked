/**
 * Relayer Service for Truly Private Agent Creation
 *
 * The relayer signs and pays for agent creation transactions, ensuring
 * the user's wallet never appears on-chain. The user's wallet only signs
 * a message to derive their master secret locally.
 *
 * Economics:
 * - User sends total (0.01 SOL fee + funding) to relayer via Privacy Cash
 * - Relayer keeps 0.01 SOL fee, forwards rest to vault
 * - On close_cloaked_agent_private, rent goes to fee_recipient (relayer) - recovers rent
 * - Private operations (freeze/unfreeze/etc) charge 50k lamports from vault to fee recipient
 *
 * Limits:
 * - IP-based rate limit: 50 ops/hour/IP (basic DoS protection)
 *
 * Security:
 * - AgentKey encrypted with NaCl box (X25519) - only user can decrypt
 * - Relayer wallet: minimal balance hot wallet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import nacl from "tweetnacl";
import IDL from "./idl.json";
import { hasSignature, addSignature, removeSignature } from "./persistence";

/**
 * Cloaked program error codes (from programs/cloaked/src/lib.rs)
 * Anchor error codes start at 6000
 */
const CLOAKED_ERROR_CODES: Record<number, { code: string; message: string }> = {
  6000: { code: "InsufficientBalance", message: "Insufficient balance in agent" },
  6001: { code: "Overflow", message: "Arithmetic overflow" },
  6002: { code: "AgentFrozen", message: "Agent is frozen" },
  6003: { code: "AgentExpired", message: "Agent has expired" },
  6004: { code: "ExceedsPerTxLimit", message: "Amount exceeds per-transaction limit" },
  6005: { code: "ExceedsDailyLimit", message: "Amount exceeds daily limit" },
  6006: { code: "ExceedsTotalLimit", message: "Amount exceeds total (lifetime) limit" },
  6007: { code: "NotOwner", message: "Unauthorized: not owner" },
  6008: { code: "IsPrivateMode", message: "Agent is in private mode - use ZK proof instructions" },
  6009: { code: "NotPrivateMode", message: "Agent is not in private mode" },
  6010: { code: "CommitmentMismatch", message: "Commitment mismatch in ZK proof" },
  6011: { code: "InvalidProof", message: "Invalid ZK proof" },
  6012: { code: "ProofVerificationFailed", message: "ZK proof verification failed" },
  6013: { code: "InvalidVerifierProgram", message: "Invalid ZK verifier program" },
  6014: { code: "InsufficientBalanceForFee", message: "Insufficient balance for operation fee" },
};

/**
 * Parse a Solana SendTransactionError and return a user-friendly error
 */
export function parseCloakedError(error: unknown): { code: string; message: string } | null {
  if (!error || typeof error !== "object") return null;

  // Check for SendTransactionError with logs
  const err = error as { transactionLogs?: string[]; message?: string };

  // Try to extract error code from logs
  if (err.transactionLogs) {
    for (const log of err.transactionLogs) {
      // Match: "Error Code: ExceedsPerTxLimit. Error Number: 6005."
      const match = log.match(/Error Code: (\w+)\. Error Number: (\d+)/);
      if (match) {
        const errorNum = parseInt(match[2], 10);
        const known = CLOAKED_ERROR_CODES[errorNum];
        if (known) return known;
        return { code: match[1], message: `Program error: ${match[1]}` };
      }
    }
  }

  // Try to extract from hex error code in message
  if (err.message) {
    // Match: "custom program error: 0x1775"
    const hexMatch = err.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      const errorNum = parseInt(hexMatch[1], 16);
      const known = CLOAKED_ERROR_CODES[errorNum];
      if (known) return known;
    }
  }

  return null;
}

const CLOAKED_PROGRAM_ID = new PublicKey("3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB");
// Attestation verifier for hybrid client-side proving (must match on-chain program)
const ZK_VERIFIER_PROGRAM_ID = new PublicKey("G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F");

/** Rate limit tracking for operations (per hour, per IP) */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit map (intentionally not persisted - see CLAUDE.md)
const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 50; // 50 operations per hour per IP

// Deposit verification: reject transactions older than 10 minutes
const MAX_TX_AGE_SECONDS = 10 * 60;

// Fee constants for private agent creation
export const CREATION_FEE = 10_000_000; // 0.01 SOL fee kept by relayer
export const MIN_DEPOSIT = 10_000_000; // 0.01 SOL minimum (fee only, no vault funding)

// Dev mode: skip deposit verification for testing (set DEV_SKIP_DEPOSIT_VERIFY=true)
const DEV_SKIP_DEPOSIT_VERIFY = process.env.DEV_SKIP_DEPOSIT_VERIFY === "true";

/** Create private agent request parameters */
export interface CreatePrivateAgentParams {
  ownerCommitment: number[];
  maxPerTx: number;
  dailyLimit: number;
  totalLimit: number;
  expiresAt: number;
  clientPublicKey: number[];
  depositSignature: string; // Privacy Cash tx signature to relayer
  depositAmount: number; // Total lamports sent (must be >= MIN_DEPOSIT)
}

/** Private operation request parameters (for ZK proof-based operations) */
export interface PrivateOperationParams {
  agentStatePda: string;
  proofBytes: number[];
  witnessBytes: number[];
}

/** Update constraints private request parameters */
export interface UpdateConstraintsPrivateParams extends PrivateOperationParams {
  maxPerTx: number | null;
  dailyLimit: number | null;
  totalLimit: number | null;
  expiresAt: number | null;
}

/** Withdraw private request parameters */
export interface WithdrawPrivateParams extends PrivateOperationParams {
  amount: number;
  destination: string;
}

/** Close private request parameters */
export interface ClosePrivateParams extends PrivateOperationParams {
  destination: string;
}

/** Spend co-sign request parameters */
export interface SpendCosignParams {
  transaction: string; // Base64 encoded serialized transaction
}

/** Create private agent response */
export interface CreatePrivateAgentResult {
  encryptedAgentKey: string;
  nonce: string;
  agentStatePda: string;
  vaultPda: string;
  delegate: string;
  signature: string;
}

/** Relayer status */
export interface RelayerStatus {
  address: string;
  balance: number;
  minBalance: number;
  ready: boolean;
}

/**
 * Relayer Service
 *
 * Handles agent creation on behalf of users, paying fees and signing
 * transactions so user wallets never appear on-chain.
 */
export class RelayerService {
  private keypair: Keypair;
  private connection: Connection;
  private program: Program;

  constructor(privateKey: string, rpcUrl: string) {
    // Decode relayer private key
    this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    this.connection = new Connection(rpcUrl, "confirmed");

    const provider = new AnchorProvider(
      this.connection,
      new Wallet(this.keypair),
      { commitment: "confirmed" }
    );
    this.program = new Program(IDL as any, provider);
  }

  /**
   * Get relayer wallet address
   */
  get address(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Check relayer status (balance, readiness)
   */
  async getStatus(): Promise<RelayerStatus> {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    const minBalance = 0.01 * LAMPORTS_PER_SOL;

    return {
      address: this.keypair.publicKey.toBase58(),
      balance: balance / LAMPORTS_PER_SOL,
      minBalance: minBalance / LAMPORTS_PER_SOL,
      ready: balance >= minBalance,
    };
  }

  /**
   * Check rate limit for an IP address (hourly operations)
   */
  checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now >= entry.resetAt) {
      return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS };
    }

    if (entry.count >= RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
    }

    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count - 1, resetIn: entry.resetAt - now };
  }

  /**
   * Increment rate limit counter for an IP
   */
  incrementRateLimit(ip: string): void {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now >= entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
      entry.count++;
    }
  }

  /**
   * Verify a deposit transaction was sent to the relayer
   * @param signature - Transaction signature
   * @param expectedAmount - Expected amount in lamports
   * @returns True if valid deposit to relayer
   */
  async verifyDeposit(signature: string, expectedAmount: number): Promise<boolean> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) {
        return false;
      }

      // Check transaction age - reject if older than MAX_TX_AGE_SECONDS
      const now = Math.floor(Date.now() / 1000);
      if (tx.blockTime) {
        const txAge = now - tx.blockTime;
        if (txAge > MAX_TX_AGE_SECONDS) {
          return false;
        }
      }

      // Transaction fetched with "confirmed" commitment - 66%+ validators confirmed
      // No additional confirmation check needed; that's already sufficient security

      // Find transfer to relayer wallet
      const relayerAddress = this.keypair.publicKey.toBase58();
      const accountKeys = tx.transaction.message.staticAccountKeys;

      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i].toBase58() === relayerAddress) {
          const preBalance = tx.meta.preBalances[i] || 0;
          const postBalance = tx.meta.postBalances[i] || 0;
          const received = postBalance - preBalance;

          if (received >= expectedAmount) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Create a private agent via relayer
   *
   * The relayer:
   * 1. Verifies deposit transaction from user (via Privacy Cash)
   * 2. Keeps CREATION_FEE (0.01 SOL), forwards rest to vault
   * 3. Generates delegate keypair server-side
   * 4. Creates the agent on-chain
   * 5. Deposits remaining funds to vault
   * 6. Encrypts agentKey with client's X25519 public key
   * 7. Returns encrypted agentKey (only client can decrypt)
   */
  async createPrivateAgent(
    params: CreatePrivateAgentParams,
    clientIp: string
  ): Promise<CreatePrivateAgentResult> {
    // Rate limit by IP
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    // Validate deposit amount
    if (params.depositAmount < MIN_DEPOSIT) {
      throw new Error(`Minimum deposit is ${MIN_DEPOSIT / LAMPORTS_PER_SOL} SOL (includes ${CREATION_FEE / LAMPORTS_PER_SOL} SOL creation fee)`);
    }

    // Check if deposit signature already used (prevent replay/front-running)
    if (hasSignature(params.depositSignature)) {
      throw new Error("Deposit signature already used - each Privacy Cash tx can only create one agent");
    }

    // Verify deposit transaction (skip in dev mode for testing)
    if (!DEV_SKIP_DEPOSIT_VERIFY) {
      const depositValid = await this.verifyDeposit(params.depositSignature, params.depositAmount);
      if (!depositValid) {
        throw new Error("Invalid deposit - transaction not found or insufficient amount sent to relayer");
      }
    }

    // Mark signature as used BEFORE creating agent (prevent race condition)
    addSignature(params.depositSignature);

    try {
      const vaultFunding = params.depositAmount - CREATION_FEE;

      const delegate = Keypair.generate();
      const agentKey = bs58.encode(delegate.secretKey);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegate.publicKey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      // Call create_cloaked_agent_private instruction
      const createSignature = await this.program.methods
        .createCloakedAgentPrivate(
          params.ownerCommitment,
          new BN(params.maxPerTx),
          new BN(params.dailyLimit),
          new BN(params.totalLimit),
          new BN(params.expiresAt)
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          delegate: delegate.publicKey,
          payer: this.keypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Deposit remaining funds to vault (if any)
      // In demo mode (DEV_SKIP_DEPOSIT_VERIFY=true), skip vault funding
      // Vault starts empty - users can fund manually via wallet or vault address
      if (vaultFunding > 0 && !DEV_SKIP_DEPOSIT_VERIFY) {
        await this.program.methods
          .deposit(new BN(vaultFunding))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            depositor: this.keypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      // Encrypt agentKey for client
      const clientPublicKey = new Uint8Array(params.clientPublicKey);
      const { encryptedAgentKey, nonce } = this.encryptAgentKey(agentKey, clientPublicKey);

      // Increment rate limit
      this.incrementRateLimit(clientIp);

      return {
        encryptedAgentKey: bs58.encode(encryptedAgentKey),
        nonce: bs58.encode(nonce),
        agentStatePda: agentStatePda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        delegate: delegate.publicKey.toBase58(),
        signature: createSignature,
      };
    } catch (error) {
      // Rollback signature on failure so user can retry with same deposit tx
      removeSignature(params.depositSignature);
      throw error;
    }
  }

  /**
   * Freeze a private agent via relayer
   */
  async freezePrivate(
    params: PrivateOperationParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    const agentStatePda = new PublicKey(params.agentStatePda);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );

    const signature = await this.program.methods
      .freezePrivate(
        Buffer.from(params.proofBytes),
        Buffer.from(params.witnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: this.keypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Unfreeze a private agent via relayer
   */
  async unfreezePrivate(
    params: PrivateOperationParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    const agentStatePda = new PublicKey(params.agentStatePda);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );

    const signature = await this.program.methods
      .unfreezePrivate(
        Buffer.from(params.proofBytes),
        Buffer.from(params.witnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: this.keypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Update constraints for a private agent via relayer
   */
  async updateConstraintsPrivate(
    params: UpdateConstraintsPrivateParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    const agentStatePda = new PublicKey(params.agentStatePda);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );

    const signature = await this.program.methods
      .updateConstraintsPrivate(
        Buffer.from(params.proofBytes),
        Buffer.from(params.witnessBytes),
        params.maxPerTx !== null ? new BN(params.maxPerTx) : null,
        params.dailyLimit !== null ? new BN(params.dailyLimit) : null,
        params.totalLimit !== null ? new BN(params.totalLimit) : null,
        params.expiresAt !== null ? new BN(params.expiresAt) : null
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: this.keypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Withdraw from a private agent via relayer
   */
  async withdrawPrivate(
    params: WithdrawPrivateParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    const agentStatePda = new PublicKey(params.agentStatePda);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    const destination = new PublicKey(params.destination);

    const signature = await this.program.methods
      .withdrawPrivate(
        Buffer.from(params.proofBytes),
        Buffer.from(params.witnessBytes),
        new BN(params.amount)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        destination,
        feeRecipient: this.keypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Close a private agent via relayer
   */
  async closePrivate(
    params: ClosePrivateParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    const agentStatePda = new PublicKey(params.agentStatePda);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    const destination = new PublicKey(params.destination);

    const signature = await this.program.methods
      .closeCloakedAgentPrivate(
        Buffer.from(params.proofBytes),
        Buffer.from(params.witnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        destination,
        feeRecipient: this.keypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Co-sign and submit a spend transaction
   *
   * The SDK builds a transaction with the delegate as a signer and the relayer
   * as fee_payer. The delegate signs first, then sends it here. The relayer
   * adds its signature and submits to the network.
   */
  async cosignSpend(
    params: SpendCosignParams,
    clientIp: string
  ): Promise<string> {
    const rateLimit = this.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000 / 60)} minutes.`);
    }

    // Decode the transaction from base64
    const txBuffer = Buffer.from(params.transaction, "base64");

    // Parse as legacy transaction (what the SDK sends)
    const legacyTx = Transaction.from(txBuffer);

    // Verify fee payer is the relayer
    if (!legacyTx.feePayer?.equals(this.keypair.publicKey)) {
      throw new Error(`Fee payer must be the relayer. Expected ${this.keypair.publicKey.toBase58()}, got ${legacyTx.feePayer?.toBase58() || "none"}`);
    }

    // Validate transaction has exactly one instruction
    if (legacyTx.instructions.length !== 1) {
      throw new Error(`Transaction must have exactly one instruction, got ${legacyTx.instructions.length}`);
    }

    const ix = legacyTx.instructions[0];

    // Validate program ID is the cloaked program
    if (!ix.programId.equals(CLOAKED_PROGRAM_ID)) {
      throw new Error(`Invalid program ID. Expected ${CLOAKED_PROGRAM_ID.toBase58()}, got ${ix.programId.toBase58()}`);
    }

    // Validate instruction discriminator is "spend"
    // From IDL: spend discriminator = [242, 205, 255, 87, 101, 217, 245, 57]
    const SPEND_DISCRIMINATOR = Buffer.from([242, 205, 255, 87, 101, 217, 245, 57]);
    if (ix.data.length < 8 || !ix.data.subarray(0, 8).equals(SPEND_DISCRIMINATOR)) {
      throw new Error("Invalid instruction: must be a spend instruction");
    }

    // Validate delegate signature exists
    // In spend instruction accounts: [cloaked_agent_state, vault, delegate, fee_payer, destination, system_program]
    // Delegate is at index 2
    if (ix.keys.length < 3) {
      throw new Error("Invalid instruction: missing required accounts");
    }
    const delegatePubkey = ix.keys[2].pubkey;
    const delegateSig = legacyTx.signatures.find(
      (sig) => sig.publicKey.equals(delegatePubkey)
    );
    if (!delegateSig?.signature) {
      throw new Error("Delegate must sign the transaction");
    }

    // Verify the delegate's signature is cryptographically valid
    const message = legacyTx.serializeMessage();
    const isValidSig = nacl.sign.detached.verify(
      message,
      delegateSig.signature,
      delegatePubkey.toBytes()
    );
    if (!isValidSig) {
      throw new Error("Invalid delegate signature - verification failed");
    }

    // Sign the transaction (partial sign - delegate already signed)
    legacyTx.partialSign(this.keypair);

    // Send the transaction
    const signature = await this.connection.sendRawTransaction(legacyTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Confirm the transaction
    await this.connection.confirmTransaction(signature, "confirmed");

    this.incrementRateLimit(clientIp);
    return signature;
  }

  /**
   * Encrypt agentKey using NaCl box (X25519 + XSalsa20-Poly1305)
   *
   * Uses an ephemeral keypair so the relayer's long-term key isn't exposed.
   */
  private encryptAgentKey(
    agentKey: string,
    clientPublicKey: Uint8Array
  ): { encryptedAgentKey: Uint8Array; nonce: Uint8Array; ephemeralPublicKey: Uint8Array } {
    // Generate ephemeral keypair for this encryption
    const ephemeralKeypair = nacl.box.keyPair();

    // Generate random nonce
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    // Encrypt agentKey
    const message = new TextEncoder().encode(agentKey);
    const encryptedAgentKey = nacl.box(
      message,
      nonce,
      clientPublicKey,
      ephemeralKeypair.secretKey
    );

    // Prepend ephemeral public key to encrypted data
    const fullEncrypted = new Uint8Array(ephemeralKeypair.publicKey.length + encryptedAgentKey.length);
    fullEncrypted.set(ephemeralKeypair.publicKey, 0);
    fullEncrypted.set(encryptedAgentKey, ephemeralKeypair.publicKey.length);

    return {
      encryptedAgentKey: fullEncrypted,
      nonce,
      ephemeralPublicKey: ephemeralKeypair.publicKey,
    };
  }
}

/** Singleton instance */
let relayerService: RelayerService | null = null;

/**
 * Initialize relayer service
 */
export function initRelayer(privateKey: string, rpcUrl: string): RelayerService {
  relayerService = new RelayerService(privateKey, rpcUrl);
  return relayerService;
}

/**
 * Get relayer service instance
 */
export function getRelayer(): RelayerService | null {
  return relayerService;
}
