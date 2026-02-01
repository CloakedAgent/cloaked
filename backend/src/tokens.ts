import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";

/**
 * On-chain CloakedAgentState account structure (deserialized by Anchor)
 */
interface CloakedAgentStateAccount {
  owner: PublicKey;
  delegate: PublicKey;
  name: number[];
  maxPerTx: BN;
  dailyLimit: BN;
  totalLimit: BN;
  expiresAt: BN;
  frozen: boolean;
  totalSpent: BN;
  dailySpent: BN;
  lastDay: BN;
  createdAt: BN;
}

// Cloaked Program ID
const CLOAKED_PROGRAM_ID = new PublicKey(
  "3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB"
);

// Seconds in a day for daily limit calculations
const SECONDS_PER_DAY = 86400;

export interface TokenInfo {
  address: string;
  owner: string;
  delegate: string;
  name: string;
  balance: number;
  balanceLamports: number;
  constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
    expiresAt: string | null;
    frozen: boolean;
  };
  spending: {
    totalSpent: number;
    dailySpent: number;
    dailyRemaining: number;
    totalRemaining: number;
  };
  status: "active" | "frozen" | "expired";
  createdAt: string;
}

export interface TokenHistoryEntry {
  signature: string;
  timestamp: string;
  type: "spend" | "deposit" | "withdraw";
  amount: number;
  amountSol: number;
  destination?: string;
  source?: string;
}

/**
 * TokenService - Queries agent state from Solana
 */
export class TokenService {
  private connection: Connection;
  private program: Program;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");

    // Create a dummy provider for reading (no signing needed)
    const dummyKeypair = Keypair.generate();
    const provider = new AnchorProvider(
      this.connection,
      new Wallet(dummyKeypair),
      { commitment: "confirmed" }
    );

    // Load IDL from local copy (not SDK path - needed for Docker deployment)
    const idl = require("./idl.json");
    this.program = new Program(idl, provider);
  }

  /**
   * Derive CloakedAgentState PDA from delegate public key
   */
  deriveAgentStatePda(delegate: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cloaked_agent_state"), delegate.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Derive Vault PDA from CloakedAgentState PDA
   */
  deriveVaultPda(agentStatePda: PublicKey): PublicKey {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return vault;
  }

  /**
   * Get all agents owned by a wallet
   *
   * Account layout for CloakedAgentState:
   * - Bytes 0-7: Anchor discriminator (8 bytes)
   * - Byte 8: Option tag (1 = Some, 0 = None)
   * - Bytes 9-40: owner Pubkey (32 bytes) if Some
   *
   * memcmp requires raw bytes encoded as base58
   */
  async getAgentsByOwner(ownerPubkey: PublicKey): Promise<TokenInfo[]> {
    // Build filter bytes: Option::Some(1) + pubkey bytes
    const ownerFilterBytes = Buffer.concat([
      Buffer.from([1]),           // Option::Some tag
      ownerPubkey.toBuffer(),     // 32 bytes pubkey
    ]);

    // Fetch all CloakedAgentState accounts where owner matches
    const accounts = await (this.program.account as any).cloakedAgentState.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: bs58.encode(ownerFilterBytes),
        },
      },
    ]);

    const agents: TokenInfo[] = [];

    for (const account of accounts) {
      const agentInfo = await this.parseAgentState(
        account.publicKey,
        account.account
      );
      agents.push(agentInfo);
    }

    return agents;
  }

  /**
   * Get a single agent by its CloakedAgentState PDA address
   */
  async getAgent(agentStatePda: PublicKey): Promise<TokenInfo | null> {
    try {
      const state = await (this.program.account as any).cloakedAgentState.fetch(agentStatePda);
      return this.parseAgentState(agentStatePda, state);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get agent by delegate public key
   */
  async getAgentByDelegate(delegate: PublicKey): Promise<TokenInfo | null> {
    const agentStatePda = this.deriveAgentStatePda(delegate);
    return this.getAgent(agentStatePda);
  }

  /**
   * Parse raw agent state into TokenInfo
   */
  private async parseAgentState(
    agentStatePda: PublicKey,
    state: CloakedAgentStateAccount
  ): Promise<TokenInfo> {
    const vaultPda = this.deriveVaultPda(agentStatePda);
    const vaultBalance = await this.connection.getBalance(vaultPda);

    const nameBytes = Buffer.from(state.name);
    const nullIndex = nameBytes.indexOf(0);
    const name = nameBytes
      .slice(0, nullIndex === -1 ? 32 : nullIndex)
      .toString("utf-8");

    const now = Math.floor(Date.now() / 1000);
    const currentDay = Math.floor(now / SECONDS_PER_DAY);
    const lastDay = state.lastDay.toNumber();

    // Calculate daily remaining (reset if new day)
    const dailySpent = currentDay > lastDay ? 0 : state.dailySpent.toNumber();
    const dailyLimit = state.dailyLimit.toNumber();
    const dailyRemaining =
      dailyLimit === 0
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, dailyLimit - dailySpent);

    // Calculate total remaining
    const totalSpent = state.totalSpent.toNumber();
    const totalLimit = state.totalLimit.toNumber();
    const totalRemaining =
      totalLimit === 0
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, totalLimit - totalSpent);

    // Determine status
    const expiresAtTs = state.expiresAt.toNumber();
    const isExpired = expiresAtTs !== 0 && now > expiresAtTs;
    const isFrozen = state.frozen;

    let status: "active" | "frozen" | "expired";
    if (isFrozen) {
      status = "frozen";
    } else if (isExpired) {
      status = "expired";
    } else {
      status = "active";
    }

    return {
      address: agentStatePda.toBase58(),
      owner: state.owner.toBase58(),
      delegate: state.delegate.toBase58(),
      name,
      balance: vaultBalance / LAMPORTS_PER_SOL,
      balanceLamports: vaultBalance,
      constraints: {
        maxPerTx: state.maxPerTx.toNumber(),
        dailyLimit,
        totalLimit,
        expiresAt:
          expiresAtTs === 0 ? null : new Date(expiresAtTs * 1000).toISOString(),
        frozen: isFrozen,
      },
      spending: {
        totalSpent,
        dailySpent,
        dailyRemaining:
          dailyRemaining === Number.MAX_SAFE_INTEGER ? -1 : dailyRemaining,
        totalRemaining:
          totalRemaining === Number.MAX_SAFE_INTEGER ? -1 : totalRemaining,
      },
      status,
      createdAt: new Date(state.createdAt.toNumber() * 1000).toISOString(),
    };
  }

  /**
   * Get spending history for an agent
   * Note: This queries transaction signatures and parses them
   */
  async getAgentHistory(
    agentStatePda: PublicKey,
    limit: number = 50
  ): Promise<TokenHistoryEntry[]> {
    const vaultPda = this.deriveVaultPda(agentStatePda);

    // Get recent signatures for the vault account
    const signatures = await this.connection.getSignaturesForAddress(vaultPda, {
      limit,
    });

    const history: TokenHistoryEntry[] = [];

    for (const sig of signatures) {
      try {
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        // Parse the transaction to determine type and amount
        const entry = this.parseTransaction(tx, sig, vaultPda);
        if (entry) {
          history.push(entry);
        }
      } catch (error) {
        // Skip transactions we can't parse
        continue;
      }
    }

    return history;
  }

  /**
   * Parse a transaction into a history entry
   */
  private parseTransaction(
    tx: ParsedTransactionWithMeta,
    sig: ConfirmedSignatureInfo,
    vaultPda: PublicKey
  ): TokenHistoryEntry | null {
    const vaultAddress = vaultPda.toBase58();
    const preBalances = tx.meta!.preBalances;
    const postBalances = tx.meta!.postBalances;
    const accountKeys = tx.transaction.message.accountKeys;

    // Find vault index - accountKeys can be ParsedMessageAccount[] or PublicKey[]
    const vaultIndex = accountKeys.findIndex((key) => {
      const pubkey = "pubkey" in key ? key.pubkey : key;
      return pubkey.toBase58() === vaultAddress;
    });

    if (vaultIndex === -1) return null;

    const preBalance = preBalances[vaultIndex];
    const postBalance = postBalances[vaultIndex];
    const diff = postBalance - preBalance;

    if (diff === 0) return null;

    // Determine transaction type
    let type: "spend" | "deposit" | "withdraw";
    let destination: string | undefined;
    let source: string | undefined;

    // Helper to get pubkey string from accountKeys (handles both parsed and raw formats)
    const getPubkeyString = (index: number): string | undefined => {
      const key = accountKeys[index];
      if (!key) return undefined;
      const pubkey = "pubkey" in key ? key.pubkey : key;
      return pubkey.toBase58();
    };

    if (diff > 0) {
      type = "deposit";
      // Source is likely the fee payer or first signer
      source = getPubkeyString(0);
    } else {
      // Could be spend or withdraw - we'd need to check instruction
      // For now, assume spend (delegate) vs withdraw (owner) based on signers
      // This is a simplification - in production, parse instruction discriminator
      type = "spend";

      // Find destination (account that received the funds)
      for (let i = 0; i < accountKeys.length; i++) {
        if (i !== vaultIndex) {
          const preBal = preBalances[i];
          const postBal = postBalances[i];
          if (postBal - preBal === Math.abs(diff)) {
            destination = getPubkeyString(i);
            break;
          }
        }
      }
    }

    const amount = Math.abs(diff);

    return {
      signature: sig.signature,
      timestamp: sig.blockTime
        ? new Date(sig.blockTime * 1000).toISOString()
        : new Date().toISOString(),
      type,
      amount,
      amountSol: amount / LAMPORTS_PER_SOL,
      destination,
      source,
    };
  }
}
