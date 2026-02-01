import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { CLOAKED_PROGRAM_ID, ZK_VERIFIER_PROGRAM_ID } from "./constants";
import IDL from "./idl.json";
import {
  CloakedAgentState,
  CreateAgentOptions,
  ConstraintOptions,
  SpendOptions,
  SpendResult,
} from "./types";
import { Signer, keypairToSigner } from "./signer";
import {
  deriveAgentSecrets,
  commitmentToBytes,
  bytesToCommitment,
  findAgentByCommitment,
  generateOwnershipProof,
  proofToInstructionArgs,
  isProverReady,
} from "./zk";
import {
  createPrivateAgentViaRelayer,
  CreatePrivateViaRelayerOptions,
  freezePrivateViaRelayer,
  unfreezePrivateViaRelayer,
  updateConstraintsPrivateViaRelayer,
  withdrawPrivateViaRelayer,
  closePrivateViaRelayer,
  cosignSpendViaRelayer,
  getRelayerPublicKey,
} from "./relayer";

// Seconds in a day for daily limit calculations
const SECONDS_PER_DAY = 86400;

/**
 * CloakedAgent - Represents a Cloaked Agent on Solana
 *
 * A Cloaked Agent is a Solana keypair where:
 * - The private key is the "Agent Key" (what users save)
 * - The derived PDA holds the SOL balance
 * - Signing with the keypair authorizes spending
 *
 * Two modes of operation:
 * - Agent mode (via constructor): Has Agent Key, can spend
 * - Owner mode (via forOwner): No Agent Key, can manage (freeze/unfreeze/update/close)
 */
export class CloakedAgent {
  private keypair: Keypair | null;
  private delegatePubkey: PublicKey;
  private connection: Connection;
  private _pda: PublicKey;
  private _bump: number;

  // Private mode fields
  private _ownerCommitment: Uint8Array | null = null;
  private _agentSecret: bigint | null = null;
  private _nonce: number | null = null;

  // Cached PDAs (set by forPrivateOwner to avoid getter issues)
  private _agentStatePda: PublicKey | null = null;
  private _vaultPda: PublicKey | null = null;

  /**
   * Create a CloakedAgent from an Agent Key (agent mode - can spend)
   * @param agentKey - Base58 encoded secret key
   * @param rpcUrl - Solana RPC endpoint URL
   */
  constructor(agentKey: string, rpcUrl: string) {
    const secretKey = bs58.decode(agentKey);
    this.keypair = Keypair.fromSecretKey(secretKey);
    this.delegatePubkey = this.keypair.publicKey;
    this.connection = new Connection(rpcUrl, "confirmed");

    // Derive the legacy PDA (seeds = ["token", delegate]) - kept for backward compatibility
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), this.delegatePubkey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    this._pda = pda;
    this._bump = bump;
  }

  /**
   * Create a CloakedAgent for owner management (freeze, unfreeze, update, close, withdraw, deposit)
   * Does NOT have delegate keypair - cannot spend.
   * Use this when you have the delegate's public key but not the Agent Key.
   *
   * @param delegatePubkey - Public key of the delegate (from URL or on-chain data)
   * @param rpcUrl - Solana RPC endpoint URL
   */
  static forOwner(delegatePubkey: PublicKey | string, rpcUrl: string): CloakedAgent {
    const pubkey = typeof delegatePubkey === "string"
      ? new PublicKey(delegatePubkey)
      : delegatePubkey;

    const instance = Object.create(CloakedAgent.prototype);
    instance.keypair = null;
    instance.delegatePubkey = pubkey;
    instance.connection = new Connection(rpcUrl, "confirmed");
    instance._ownerCommitment = null;
    instance._agentSecret = null;
    instance._nonce = null;

    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), pubkey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    instance._pda = pda;
    instance._bump = bump;

    return instance;
  }

  /**
   * Create a CloakedAgent for private owner management (ZK proof-based)
   * Uses the master secret and nonce to derive the agent secret and find the agent.
   *
   * @param masterSecret - Master secret derived from wallet signature
   * @param nonce - Agent index (0, 1, 2, ...)
   * @param rpcUrl - Solana RPC endpoint URL
   * @returns CloakedAgent instance for private management
   */
  static async forPrivateOwner(
    masterSecret: bigint,
    nonce: number,
    rpcUrl: string
  ): Promise<CloakedAgent> {
    const { agentSecret, commitment } = await deriveAgentSecrets(masterSecret, nonce);
    const connection = new Connection(rpcUrl, "confirmed");

    // Find agent by commitment
    const found = await findAgentByCommitment(commitment, connection);
    if (!found) {
      throw new Error(`No Cloaked Agent found for nonce ${nonce}`);
    }

    const instance = Object.create(CloakedAgent.prototype);
    instance.keypair = null;
    instance.delegatePubkey = found.delegate;
    instance.connection = connection;
    instance._ownerCommitment = commitmentToBytes(commitment);
    instance._agentSecret = agentSecret;
    instance._nonce = nonce;

    // Legacy PDA (seeds = ["token", delegate]) - kept for backward compatibility
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), found.delegate.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    instance._pda = pda;
    instance._bump = bump;

    // Cache agentStatePda and vaultPda for private mode operations
    const [agentStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cloaked_agent_state"), found.delegate.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    instance._agentStatePda = agentStatePda;

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    instance._vaultPda = vaultPda;

    return instance;
  }

  /**
   * Check if this agent is in private mode
   */
  get isPrivateMode(): boolean {
    return this._ownerCommitment !== null && this._agentSecret !== null;
  }

  /**
   * Get the owner commitment (private mode only)
   */
  get ownerCommitment(): Uint8Array | null {
    return this._ownerCommitment;
  }

  /**
   * The agent's public key (used to derive PDA)
   */
  get publicKey(): PublicKey {
    return this.delegatePubkey;
  }

  /**
   * The PDA that holds this agent's SOL balance
   */
  get pda(): PublicKey {
    return this._pda;
  }

  /**
   * The bump seed used for PDA derivation
   */
  get bump(): number {
    return this._bump;
  }

  /**
   * Get the CloakedAgentState PDA address for this delegate
   */
  get agentStatePda(): PublicKey {
    // Use cached value if available (set by forPrivateOwner)
    if (this._agentStatePda) {
      return this._agentStatePda;
    }
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cloaked_agent_state"), this.delegatePubkey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Get the Vault PDA address for this agent
   */
  get vaultPda(): PublicKey {
    // Use cached value if available (set by forPrivateOwner)
    if (this._vaultPda) {
      return this._vaultPda;
    }
    const agentStatePda = this.agentStatePda;
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return vault;
  }

  /**
   * Get the current SOL balance of this agent
   * @returns Balance in SOL
   */
  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.vaultPda);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Get the current balance in lamports
   * @returns Balance in lamports
   */
  async getBalanceLamports(): Promise<number> {
    return await this.connection.getBalance(this.vaultPda);
  }

  /**
   * Generate a new random Cloaked Agent
   * @param rpcUrl - Solana RPC endpoint URL
   * @returns New agent instance and its Agent Key
   */
  static generate(rpcUrl: string): { agent: CloakedAgent; agentKey: string } {
    const keypair = Keypair.generate();
    const agentKey = bs58.encode(keypair.secretKey);
    const agent = new CloakedAgent(agentKey, rpcUrl);
    return { agent, agentKey };
  }

  /**
   * Derive the PDA for any public key (without needing full agent)
   * @param publicKey - Agent's public key
   * @returns The PDA address
   */
  static derivePda(publicKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), publicKey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Derive PDA with bump
   * @param publicKey - Agent's public key
   * @returns The PDA address and bump
   */
  static derivePdaWithBump(publicKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("token"), publicKey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
  }

  /**
   * Derive CloakedAgentState PDA for a delegate
   */
  static deriveAgentStatePda(delegate: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cloaked_agent_state"), delegate.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Derive Vault PDA from CloakedAgentState PDA
   */
  static deriveVaultPda(agentStatePda: PublicKey): PublicKey {
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    return vault;
  }

  /**
   * Create a new Cloaked Agent with constraints on-chain
   * @param connection - Solana connection
   * @param owner - Owner wallet (Signer - can be wallet adapter or wrapped Keypair)
   * @param options - Agent creation options
   * @returns New CloakedAgent instance and Agent Key
   */
  static async create(
    connection: Connection,
    owner: Signer,
    options: CreateAgentOptions
  ): Promise<{ agent: CloakedAgent; agentKey: string; signature: string }> {
    const rpcUrl = connection.rpcEndpoint;

    // Generate new delegate keypair
    const delegate = Keypair.generate();
    const agentKey = bs58.encode(delegate.secretKey);

    const provider = new AnchorProvider(
      connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    // Convert expiration to unix timestamp (0 = never)
    const expiresAt = options.expiresAt
      ? Math.floor(options.expiresAt.getTime() / 1000)
      : 0;

    // Derive PDAs
    const agentStatePda = CloakedAgent.deriveAgentStatePda(delegate.publicKey);
    const vaultPda = CloakedAgent.deriveVaultPda(agentStatePda);

    // Call create_cloaked_agent instruction
    const signature = await program.methods
      .createCloakedAgent(
        new BN(options.maxPerTx ?? 0),
        new BN(options.dailyLimit ?? 0),
        new BN(options.totalLimit ?? 0),
        new BN(expiresAt)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        owner: owner.publicKey,
        delegate: delegate.publicKey,
        payer: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // If initial deposit requested, deposit funds
    if (options.initialDeposit && options.initialDeposit > 0) {
      await program.methods
        .deposit(new BN(options.initialDeposit))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const agent = new CloakedAgent(agentKey, rpcUrl);
    return { agent, agentKey, signature };
  }

  /**
   * Fetch full agent state from on-chain
   * @returns CloakedAgentState with all constraints and spending info
   */
  async getState(): Promise<CloakedAgentState> {
    const dummyWallet = this.keypair
      ? new Wallet(this.keypair)
      : {
          publicKey: this.delegatePubkey,
          signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
          signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
        };

    const provider = new AnchorProvider(
      this.connection,
      dummyWallet as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;
    const vaultPda = this.vaultPda;

    const state = await (program.account as any).cloakedAgentState.fetch(agentStatePda);
    const balance = await this.connection.getBalance(vaultPda);

    const now = Math.floor(Date.now() / 1000);
    const currentDay = Math.floor(now / SECONDS_PER_DAY);
    const lastDay = (state.lastDay as BN).toNumber();

    const dailySpent = currentDay > lastDay ? 0 : (state.dailySpent as BN).toNumber();
    const dailyLimit = (state.dailyLimit as BN).toNumber();
    const dailyRemaining = dailyLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, dailyLimit - dailySpent);

    const totalSpent = (state.totalSpent as BN).toNumber();
    const totalLimit = (state.totalLimit as BN).toNumber();
    const totalRemaining = totalLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, totalLimit - totalSpent);
    const expiresAtTs = (state.expiresAt as BN).toNumber();
    const isExpired = expiresAtTs !== 0 && now > expiresAtTs;
    const isFrozen = state.frozen as boolean;

    let status: "active" | "frozen" | "expired";
    if (isFrozen) {
      status = "frozen";
    } else if (isExpired) {
      status = "expired";
    } else {
      status = "active";
    }

    // Handle Option<Pubkey> for owner - null if private mode
    const owner = state.owner ? (state.owner as PublicKey) : null;
    const ownerCommitment = new Uint8Array(state.ownerCommitment as number[]);
    const isPrivate = owner === null;

    return {
      address: agentStatePda,
      owner,
      ownerCommitment,
      delegate: state.delegate as PublicKey,
      balance,

      constraints: {
        maxPerTx: (state.maxPerTx as BN).toNumber(),
        dailyLimit,
        totalLimit,
        expiresAt: expiresAtTs === 0 ? null : new Date(expiresAtTs * 1000),
        frozen: isFrozen,
      },

      spending: {
        totalSpent,
        dailySpent,
        dailyRemaining,
        totalRemaining,
      },

      status,
      createdAt: new Date((state.createdAt as BN).toNumber() * 1000),
      isPrivate,
    };
  }

  /**
   * Spend from vault to destination (delegate signs)
   * Requires agent mode (Agent Key) - throws if in owner mode.
   *
   * Two fee payment modes:
   *
   * 1. **With feePayer (standard mode)**: User's wallet pays tx fee directly
   *    - No relayer involved
   *    - Normal tx fee (~5k lamports) paid by user wallet
   *    - Vault only pays the amount to destination
   *
   * 2. **Without feePayer (agent/MCP mode)**: Relayer pays, vault reimburses
   *    - Relayer fronts the tx fee
   *    - Vault reimburses relayer 10k lamports
   *    - Delegate doesn't need any SOL
   *
   * @param options - Spend options (destination, amount, optional feePayer)
   * @returns Spend result with signature and remaining balances
   */
  async spend(options: SpendOptions): Promise<SpendResult> {
    if (!this.keypair) {
      throw new Error("Cannot spend in owner mode - requires Agent Key");
    }

    const agentStatePda = this.agentStatePda;
    const vaultPda = this.vaultPda;

    // If feePayer provided, user pays directly (no relayer)
    if (options.feePayer) {
      return this.spendWithFeePayer(options, agentStatePda, vaultPda);
    }

    // No feePayer - use relayer
    return this.spendViaRelayer(options, agentStatePda, vaultPda);
  }

  /**
   * Spend with user-provided fee payer (no relayer)
   */
  private async spendWithFeePayer(
    options: SpendOptions,
    agentStatePda: PublicKey,
    vaultPda: PublicKey
  ): Promise<SpendResult> {
    const feePayer = options.feePayer as Signer;

    const provider = new AnchorProvider(
      this.connection,
      feePayer as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const spendIx = await program.methods
      .spend(new BN(options.amount))
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        delegate: this.keypair!.publicKey,
        feePayer: feePayer.publicKey,
        destination: options.destination,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.add(spendIx);
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    tx.partialSign(this.keypair!);

    const signature = await provider.sendAndConfirm(tx, [this.keypair!]);

    const state = await this.getState();

    return {
      signature,
      remainingBalance: state.balance,
      dailyRemaining: state.spending.dailyRemaining,
    };
  }

  /**
   * Spend via relayer (relayer pays, vault reimburses)
   */
  private async spendViaRelayer(
    options: SpendOptions,
    agentStatePda: PublicKey,
    vaultPda: PublicKey
  ): Promise<SpendResult> {
    const feePayerPubkey = await getRelayerPublicKey();

    const dummyProvider = new AnchorProvider(
      this.connection,
      new Wallet(this.keypair!),
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, dummyProvider);

    const spendIx = await program.methods
      .spend(new BN(options.amount))
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        delegate: this.keypair!.publicKey,
        feePayer: feePayerPubkey,
        destination: options.destination,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction();
    tx.add(spendIx);
    tx.feePayer = feePayerPubkey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    tx.partialSign(this.keypair!);

    const serializedTx = tx.serialize({ requireAllSignatures: false });
    const txBase64 = serializedTx.toString("base64");

    const signature = await cosignSpendViaRelayer(txBase64);
    const state = await this.getState();

    return {
      signature,
      remainingBalance: state.balance,
      dailyRemaining: state.spending.dailyRemaining,
    };
  }

  /**
   * Deposit SOL to vault (anyone can call)
   * @param depositor - Signer of the depositor (wallet adapter or wrapped Keypair)
   * @param amount - Amount in lamports
   * @returns Transaction signature
   */
  async deposit(depositor: Signer, amount: number): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      depositor as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;
    const vaultPda = this.vaultPda;

    const signature = await program.methods
      .deposit(new BN(amount))
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        depositor: depositor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return signature;
  }

  /**
   * Freeze agent (owner only) - emergency stop
   * @param owner - Owner signer (wallet adapter or wrapped Keypair)
   * @returns Transaction signature
   */
  async freeze(owner: Signer): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;

    const signature = await program.methods
      .freeze()
      .accounts({
        cloakedAgentState: agentStatePda,
        owner: owner.publicKey,
      })
      .rpc();

    return signature;
  }

  /**
   * Unfreeze agent (owner only)
   * @param owner - Owner signer (wallet adapter or wrapped Keypair)
   * @returns Transaction signature
   */
  async unfreeze(owner: Signer): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;

    const signature = await program.methods
      .unfreeze()
      .accounts({
        cloakedAgentState: agentStatePda,
        owner: owner.publicKey,
      })
      .rpc();

    return signature;
  }

  /**
   * Update agent constraints (owner only)
   * @param owner - Owner signer (wallet adapter or wrapped Keypair)
   * @param options - New constraint values (null = no change)
   * @returns Transaction signature
   */
  async updateConstraints(owner: Signer, options: ConstraintOptions): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;

    const maxPerTx = options.maxPerTx !== undefined ? new BN(options.maxPerTx) : null;
    const dailyLimit = options.dailyLimit !== undefined ? new BN(options.dailyLimit) : null;
    const totalLimit = options.totalLimit !== undefined ? new BN(options.totalLimit) : null;
    const expiresAt = options.expiresAt !== undefined
      ? new BN(options.expiresAt ? Math.floor(options.expiresAt.getTime() / 1000) : 0)
      : null;

    const signature = await program.methods
      .updateConstraints(maxPerTx, dailyLimit, totalLimit, expiresAt)
      .accounts({
        cloakedAgentState: agentStatePda,
        owner: owner.publicKey,
      })
      .rpc();

    return signature;
  }

  /**
   * Close agent and reclaim all funds to owner (owner only)
   * @param owner - Owner signer (wallet adapter or wrapped Keypair)
   * @returns Transaction signature
   */
  async close(owner: Signer): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;
    const vaultPda = this.vaultPda;

    const signature = await program.methods
      .closeCloakedAgent()
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return signature;
  }

  /**
   * Withdraw from vault to any destination (owner only, no constraints)
   * Works even if agent is frozen or expired - owner has full control
   * Preserves privacy by allowing withdrawal to any wallet
   * @param owner - Owner signer (wallet adapter or wrapped Keypair)
   * @param amount - Amount in lamports to withdraw
   * @param destination - Destination wallet (any PublicKey)
   * @returns Transaction signature
   */
  async withdraw(owner: Signer, amount: number, destination: PublicKey): Promise<string> {
    const provider = new AnchorProvider(
      this.connection,
      owner as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    const agentStatePda = this.agentStatePda;
    const vaultPda = this.vaultPda;

    const signature = await program.methods
      .withdraw(new BN(amount))
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        owner: owner.publicKey,
        destination: destination,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return signature;
  }

  // ============================================
  // Private Mode Methods (ZK Proof-Based)
  // ============================================

  /**
   * Create a new Cloaked Agent in private mode (no wallet linked on-chain)
   *
   * @param connection - Solana connection
   * @param payer - Payer for transaction fees (can be any signer)
   * @param masterSecret - Master secret derived from wallet signature
   * @param nonce - Agent index (0, 1, 2, ...)
   * @param options - Agent creation options
   * @returns New CloakedAgent instance (with private mode) and Agent Key
   */
  static async createPrivate(
    connection: Connection,
    payer: Signer,
    masterSecret: bigint,
    nonce: number,
    options: Omit<CreateAgentOptions, "delegate">
  ): Promise<{ agent: CloakedAgent; agentKey: string; signature: string }> {
    const rpcUrl = connection.rpcEndpoint;

    // Derive commitment from master secret and nonce
    const { agentSecret, commitment } = await deriveAgentSecrets(masterSecret, nonce);
    const commitmentBytes = commitmentToBytes(commitment);

    // Generate new delegate keypair
    const delegate = Keypair.generate();
    const agentKey = bs58.encode(delegate.secretKey);

    const provider = new AnchorProvider(
      connection,
      payer as Wallet,
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    // Convert expiration to unix timestamp (0 = never)
    const expiresAt = options.expiresAt
      ? Math.floor(options.expiresAt.getTime() / 1000)
      : 0;

    // Derive PDAs
    const agentStatePda = CloakedAgent.deriveAgentStatePda(delegate.publicKey);
    const vaultPda = CloakedAgent.deriveVaultPda(agentStatePda);

    // Call create_cloaked_agent_private instruction
    const signature = await program.methods
      .createCloakedAgentPrivate(
        Array.from(commitmentBytes),
        new BN(options.maxPerTx ?? 0),
        new BN(options.dailyLimit ?? 0),
        new BN(options.totalLimit ?? 0),
        new BN(expiresAt)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        delegate: delegate.publicKey,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // If initial deposit requested, deposit funds
    if (options.initialDeposit && options.initialDeposit > 0) {
      await program.methods
        .deposit(new BN(options.initialDeposit))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const agent = new CloakedAgent(agentKey, rpcUrl);
    agent._ownerCommitment = commitmentBytes;
    agent._agentSecret = agentSecret;
    agent._nonce = nonce;

    return { agent, agentKey, signature };
  }

  /**
   * Create a new Cloaked Agent via relayer (truly private - user wallet never signs on-chain)
   *
   * This is the most private mode of operation:
   * 1. User signs message to derive master secret (client-side only)
   * 2. User sends total (fee + funding) to relayer via Privacy Cash
   * 3. Relayer keeps 0.01 SOL fee, forwards rest to vault
   * 4. Relayer creates the agent on-chain (generates delegate)
   * 5. Agent Key encrypted for user (only user can decrypt)
   * 6. User's wallet NEVER appears in any on-chain transaction
   *
   * @param masterSecret - Master secret derived from wallet signature
   * @param nonce - Agent index (0, 1, 2, ...)
   * @param options - Agent creation options
   * @param depositSignature - Privacy Cash tx signature to relayer
   * @param depositAmount - Total lamports sent (fee + vault funding)
   * @param rpcUrl - Solana RPC endpoint URL
   * @param apiUrl - Optional backend API URL
   * @returns New CloakedAgent instance (with private mode) and Agent Key
   */
  static async createPrivateViaRelayer(
    masterSecret: bigint,
    nonce: number,
    options: Omit<CreateAgentOptions, "delegate" | "initialDeposit">,
    depositSignature: string,
    depositAmount: number,
    rpcUrl: string,
    apiUrl?: string
  ): Promise<{ agent: CloakedAgent; agentKey: string; signature: string; vaultPda: PublicKey }> {
    // Call relayer API
    const result = await createPrivateAgentViaRelayer(
      masterSecret,
      nonce,
      {
        maxPerTx: options.maxPerTx,
        dailyLimit: options.dailyLimit,
        totalLimit: options.totalLimit,
        expiresAt: options.expiresAt,
      },
      depositSignature,
      depositAmount,
      apiUrl
    );

    // Derive agent secret for private mode operations
    const { agentSecret, commitment } = await deriveAgentSecrets(masterSecret, nonce);
    const commitmentBytes = commitmentToBytes(commitment);

    // Create agent instance with private mode
    const agent = new CloakedAgent(result.agentKey, rpcUrl);
    agent._ownerCommitment = commitmentBytes;
    agent._agentSecret = agentSecret;
    agent._nonce = nonce;

    return {
      agent,
      agentKey: result.agentKey,
      signature: result.signature,
      vaultPda: result.vaultPda,
    };
  }

  /**
   * Create a new Cloaked Agent using your own relayer keypair (no backend needed, no fees)
   *
   * This is for technical users who want to:
   * - Use their own funded keypair as a relayer
   * - Pay their own rent (no 0.01 SOL fee to our relayer)
   * - Have full control over the creation process
   * - Fund vault separately via Privacy Cash for anonymity
   *
   * Flow:
   * 1. User signs message to derive master secret (client-side only)
   * 2. User provides a funded Keypair to pay rent
   * 3. Creates agent directly on-chain (relayerKeypair signs and pays)
   * 4. User's main wallet NEVER appears in any on-chain transaction
   * 5. Fund vault separately via Privacy Cash for complete anonymity
   *
   * @param masterSecret - Master secret derived from wallet signature
   * @param nonce - Agent index (0, 1, 2, ...)
   * @param options - Agent creation options
   * @param relayerKeypair - User's own funded keypair (pays rent ~0.00138 SOL)
   * @param rpcUrl - Solana RPC endpoint URL
   * @returns New CloakedAgent instance (with private mode) and Agent Key
   */
  static async createPrivateWithRelayer(
    masterSecret: bigint,
    nonce: number,
    options: Omit<CreateAgentOptions, "delegate" | "initialDeposit">,
    relayerKeypair: Keypair,
    rpcUrl: string
  ): Promise<{ agent: CloakedAgent; agentKey: string; signature: string; vaultPda: PublicKey }> {
    const connection = new Connection(rpcUrl, "confirmed");

    // Derive commitment from master secret and nonce
    const { agentSecret, commitment } = await deriveAgentSecrets(masterSecret, nonce);
    const commitmentBytes = commitmentToBytes(commitment);

    // Generate new delegate keypair
    const delegate = Keypair.generate();
    const agentKey = bs58.encode(delegate.secretKey);

    const provider = new AnchorProvider(
      connection,
      new Wallet(relayerKeypair),
      { commitment: "confirmed" }
    );
    const program = new Program(IDL as any, provider);

    // Convert expiration to unix timestamp (0 = never)
    const expiresAt = options.expiresAt
      ? Math.floor(options.expiresAt.getTime() / 1000)
      : 0;

    // Derive PDAs
    const agentStatePda = CloakedAgent.deriveAgentStatePda(delegate.publicKey);
    const vaultPda = CloakedAgent.deriveVaultPda(agentStatePda);

    // Call create_cloaked_agent_private instruction
    const signature = await program.methods
      .createCloakedAgentPrivate(
        Array.from(commitmentBytes),
        new BN(options.maxPerTx ?? 0),
        new BN(options.dailyLimit ?? 0),
        new BN(options.totalLimit ?? 0),
        new BN(expiresAt)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        delegate: delegate.publicKey,
        payer: relayerKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agent = new CloakedAgent(agentKey, rpcUrl);
    agent._ownerCommitment = commitmentBytes;
    agent._agentSecret = agentSecret;
    agent._nonce = nonce;

    return {
      agent,
      agentKey,
      signature,
      vaultPda,
    };
  }

  /**
   * Freeze agent using ZK proof (private mode only)
   * Uses relayer to submit transaction - vault pays for fees
   * @param apiUrl - Optional API URL for relayer
   * @returns Transaction signature
   */
  async freezePrivate(apiUrl?: string): Promise<string> {
    if (!this._agentSecret || !this._ownerCommitment) {
      throw new Error("Not in private mode - use freeze() with owner signer instead");
    }

    if (!isProverReady()) {
      throw new Error("ZK prover not initialized. Call initProver() first.");
    }

    const commitment = bytesToCommitment(this._ownerCommitment);
    const proof = await generateOwnershipProof(this._agentSecret, commitment);
    const proofArgs = proofToInstructionArgs(proof);

    const signature = await freezePrivateViaRelayer(
      {
        agentStatePda: this.agentStatePda.toBase58(),
        proofBytes: Array.from(proofArgs.proofBytes),
        witnessBytes: Array.from(proofArgs.witnessBytes),
      },
      apiUrl
    );

    return signature;
  }

  /**
   * Unfreeze agent using ZK proof (private mode only)
   * Uses relayer to submit transaction - vault pays for fees
   * @param apiUrl - Optional API URL for relayer
   * @returns Transaction signature
   */
  async unfreezePrivate(apiUrl?: string): Promise<string> {
    if (!this._agentSecret || !this._ownerCommitment) {
      throw new Error("Not in private mode - use unfreeze() with owner signer instead");
    }

    if (!isProverReady()) {
      throw new Error("ZK prover not initialized. Call initProver() first.");
    }

    const commitment = bytesToCommitment(this._ownerCommitment);
    const proof = await generateOwnershipProof(this._agentSecret, commitment);
    const proofArgs = proofToInstructionArgs(proof);

    const signature = await unfreezePrivateViaRelayer(
      {
        agentStatePda: this.agentStatePda.toBase58(),
        proofBytes: Array.from(proofArgs.proofBytes),
        witnessBytes: Array.from(proofArgs.witnessBytes),
      },
      apiUrl
    );

    return signature;
  }

  /**
   * Update constraints using ZK proof (private mode only)
   * Uses relayer to submit transaction - vault pays for fees
   * @param options - New constraint values (undefined = no change)
   * @param apiUrl - Optional API URL for relayer
   * @returns Transaction signature
   */
  async updateConstraintsPrivate(options: ConstraintOptions, apiUrl?: string): Promise<string> {
    if (!this._agentSecret || !this._ownerCommitment) {
      throw new Error("Not in private mode - use updateConstraints() with owner signer instead");
    }

    if (!isProverReady()) {
      throw new Error("ZK prover not initialized. Call initProver() first.");
    }

    const commitment = bytesToCommitment(this._ownerCommitment);
    const proof = await generateOwnershipProof(this._agentSecret, commitment);
    const proofArgs = proofToInstructionArgs(proof);

    const signature = await updateConstraintsPrivateViaRelayer(
      {
        agentStatePda: this.agentStatePda.toBase58(),
        proofBytes: Array.from(proofArgs.proofBytes),
        witnessBytes: Array.from(proofArgs.witnessBytes),
        maxPerTx: options.maxPerTx !== undefined ? options.maxPerTx : null,
        dailyLimit: options.dailyLimit !== undefined ? options.dailyLimit : null,
        totalLimit: options.totalLimit !== undefined ? options.totalLimit : null,
        expiresAt: options.expiresAt !== undefined
          ? (options.expiresAt ? Math.floor(options.expiresAt.getTime() / 1000) : 0)
          : null,
      },
      apiUrl
    );

    return signature;
  }

  /**
   * Close agent and reclaim funds using ZK proof (private mode only)
   * Uses relayer to submit transaction - vault pays for fees
   * @param destination - Destination for remaining funds
   * @param apiUrl - Optional API URL for relayer
   * @returns Transaction signature
   */
  async closePrivate(destination: PublicKey, apiUrl?: string): Promise<string> {
    if (!this._agentSecret || !this._ownerCommitment) {
      throw new Error("Not in private mode - use close() with owner signer instead");
    }

    if (!isProverReady()) {
      throw new Error("ZK prover not initialized. Call initProver() first.");
    }

    const commitment = bytesToCommitment(this._ownerCommitment);
    const proof = await generateOwnershipProof(this._agentSecret, commitment);
    const proofArgs = proofToInstructionArgs(proof);

    const signature = await closePrivateViaRelayer(
      {
        agentStatePda: this.agentStatePda.toBase58(),
        proofBytes: Array.from(proofArgs.proofBytes),
        witnessBytes: Array.from(proofArgs.witnessBytes),
        destination: destination.toBase58(),
      },
      apiUrl
    );

    return signature;
  }

  /**
   * Withdraw using ZK proof (private mode only)
   * Uses relayer to submit transaction - vault pays for fees
   * @param amount - Amount in lamports to withdraw
   * @param destination - Destination for funds
   * @param apiUrl - Optional API URL for relayer
   * @returns Transaction signature
   */
  async withdrawPrivate(amount: number, destination: PublicKey, apiUrl?: string): Promise<string> {
    if (!this._agentSecret || !this._ownerCommitment) {
      throw new Error("Not in private mode - use withdraw() with owner signer instead");
    }

    if (!isProverReady()) {
      throw new Error("ZK prover not initialized. Call initProver() first.");
    }

    const commitment = bytesToCommitment(this._ownerCommitment);
    const proof = await generateOwnershipProof(this._agentSecret, commitment);
    const proofArgs = proofToInstructionArgs(proof);

    const signature = await withdrawPrivateViaRelayer(
      {
        agentStatePda: this.agentStatePda.toBase58(),
        proofBytes: Array.from(proofArgs.proofBytes),
        witnessBytes: Array.from(proofArgs.witnessBytes),
        amount,
        destination: destination.toBase58(),
      },
      apiUrl
    );

    return signature;
  }

  /**
   * Securely destroy sensitive data in this agent instance
   * Call this when done using the agent to clear secrets from memory
   */
  destroy(): void {
    // Zero out keypair secret key
    if (this.keypair) {
      this.keypair.secretKey.fill(0);
      this.keypair = null as unknown as Keypair;
    }

    // Clear private mode secrets
    if (this._agentSecret !== null) {
      this._agentSecret = BigInt(0);
      this._agentSecret = null;
    }

    if (this._ownerCommitment !== null) {
      this._ownerCommitment.fill(0);
      this._ownerCommitment = null;
    }

    this._nonce = null;
  }
}
