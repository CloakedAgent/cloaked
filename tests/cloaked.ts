import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cloaked } from "../target/types/cloaked";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("cloaked", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Cloaked as Program<Cloaked>;

  describe("create_cloaked_agent instruction", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();

      // Airdrop to owner
      const sig = await provider.connection.requestAirdrop(
        owner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Derive PDAs
      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );
    });

    it("creates an agent with constraints", async () => {
      const maxPerTx = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
      const dailyLimit = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const totalLimit = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const expiresAt = new anchor.BN(0); // Never expires

      await program.methods
        .createCloakedAgent(
          maxPerTx,
          dailyLimit,
          totalLimit,
          expiresAt
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Verify agent state
      const agentState = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(agentState.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(agentState.delegate.toBase58()).to.equal(delegateKeypair.publicKey.toBase58());
      expect(agentState.maxPerTx.toNumber()).to.equal(maxPerTx.toNumber());
      expect(agentState.dailyLimit.toNumber()).to.equal(dailyLimit.toNumber());
      expect(agentState.totalLimit.toNumber()).to.equal(totalLimit.toNumber());
      expect(agentState.frozen).to.equal(false);
      expect(agentState.totalSpent.toNumber()).to.equal(0);
      expect(agentState.dailySpent.toNumber()).to.equal(0);
    });

    it("deposits SOL to agent vault", async () => {
      // First create the agent
      await program.methods
        .createCloakedAgent(
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0)
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Deposit 0.5 SOL
      const depositAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
      const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);

      await program.methods
        .deposit(depositAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);
      expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(depositAmount.toNumber());
    });
  });

  describe("spend instruction", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;
    let destination: Keypair;
    let feePayer: Keypair;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();
      destination = Keypair.generate();
      feePayer = Keypair.generate();

      // Airdrop to owner and fee payer
      const sig1 = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig1);

      const sig2 = await provider.connection.requestAirdrop(
        feePayer.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig2);

      // Derive PDAs
      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      // Create agent with constraints
      await program.methods
        .createCloakedAgent(
          new anchor.BN(0.1 * LAMPORTS_PER_SOL),  // max 0.1 SOL per tx
          new anchor.BN(0.5 * LAMPORTS_PER_SOL),  // max 0.5 SOL per day
          new anchor.BN(2 * LAMPORTS_PER_SOL),    // max 2 SOL total
          new anchor.BN(0)                         // never expires
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Deposit 1 SOL
      await program.methods
        .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("allows delegate to spend within limits", async () => {
      const spendAmount = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
      const destBefore = await provider.connection.getBalance(destination.publicKey);

      await program.methods
        .spend(spendAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          destination: destination.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      const destAfter = await provider.connection.getBalance(destination.publicKey);
      expect(destAfter - destBefore).to.equal(spendAmount.toNumber());

      // Verify tracking updated
      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.totalSpent.toNumber()).to.equal(spendAmount.toNumber());
      expect(state.dailySpent.toNumber()).to.equal(spendAmount.toNumber());
    });

    it("fails when amount exceeds max_per_tx", async () => {
      const excessiveAmount = new anchor.BN(0.2 * LAMPORTS_PER_SOL); // > 0.1 limit

      try {
        await program.methods
          .spend(excessiveAmount)
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            destination: destination.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();

        expect.fail("Should have failed with ExceedsPerTxLimit");
      } catch (error: any) {
        expect(error.message).to.include("ExceedsPerTxLimit");
      }
    });

    it("fails when non-delegate tries to spend", async () => {
      const randomSigner = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        randomSigner.publicKey,
        0.1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      try {
        await program.methods
          .spend(new anchor.BN(0.01 * LAMPORTS_PER_SOL))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            delegate: randomSigner.publicKey,
            feePayer: feePayer.publicKey,
            destination: destination.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([randomSigner, feePayer])
          .rpc();

        expect.fail("Should have failed with constraint error");
      } catch (error: any) {
        // Should fail - delegate doesn't match
        expect(error.toString()).to.satisfy((msg: string) =>
          msg.includes("ConstraintSeeds") ||
          msg.includes("seeds constraint") ||
          msg.includes("A seeds constraint was violated")
        );
      }
    });
  });

  describe("freeze/unfreeze instructions", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        owner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("owner can freeze agent", async () => {
      await program.methods
        .freeze()
        .accounts({
          cloakedAgentState: agentStatePda,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.frozen).to.equal(true);
    });

    it("owner can unfreeze agent", async () => {
      // First freeze
      await program.methods
        .freeze()
        .accounts({ cloakedAgentState: agentStatePda, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      // Then unfreeze
      await program.methods
        .unfreeze()
        .accounts({ cloakedAgentState: agentStatePda, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.frozen).to.equal(false);
    });

    it("non-owner cannot freeze", async () => {
      const nonOwner = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(nonOwner.publicKey, 0.1 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      try {
        await program.methods
          .freeze()
          .accounts({ cloakedAgentState: agentStatePda, owner: nonOwner.publicKey })
          .signers([nonOwner])
          .rpc();
        expect.fail("Should fail");
      } catch (error: any) {
        expect(error.toString()).to.satisfy((msg: string) =>
          msg.includes("NotOwner") ||
          msg.includes("not owner")
        );
      }
    });
  });

  describe("update_constraints instruction", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(
          new anchor.BN(1000),
          new anchor.BN(10000),
          new anchor.BN(100000),
          new anchor.BN(0)
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("owner can update constraints", async () => {
      const newMaxPerTx = new anchor.BN(2000);
      const newDailyLimit = new anchor.BN(20000);

      await program.methods
        .updateConstraints(newMaxPerTx, newDailyLimit, null, null)
        .accounts({
          cloakedAgentState: agentStatePda,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.maxPerTx.toNumber()).to.equal(2000);
      expect(state.dailyLimit.toNumber()).to.equal(20000);
      expect(state.totalLimit.toNumber()).to.equal(100000); // unchanged
    });
  });

  describe("close_cloaked_agent instruction", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Deposit some SOL
      await program.methods
        .deposit(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("owner can close agent and reclaim funds", async () => {
      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .closeCloakedAgent()
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Owner should receive vault balance + rent from agent_state
      expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);

      // Agent state should be closed
      const accountInfo = await provider.connection.getAccountInfo(agentStatePda);
      expect(accountInfo).to.be.null;
    });
  });

  describe("withdraw instruction (owner only)", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;
    let destinationWallet: Keypair;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();
      destinationWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 3 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(
          new anchor.BN(0.01 * LAMPORTS_PER_SOL),  // small max per tx
          new anchor.BN(0.1 * LAMPORTS_PER_SOL),   // small daily limit
          new anchor.BN(0.5 * LAMPORTS_PER_SOL),   // small total limit
          new anchor.BN(0)
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Deposit 1 SOL
      await program.methods
        .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("owner can withdraw to any destination (no constraints)", async () => {
      const withdrawAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
      const destBefore = await provider.connection.getBalance(destinationWallet.publicKey);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          destination: destinationWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const destAfter = await provider.connection.getBalance(destinationWallet.publicKey);
      expect(destAfter - destBefore).to.equal(withdrawAmount.toNumber());
    });

    it("owner can withdraw more than spend constraints allow", async () => {
      // Constraints: max_per_tx = 0.01 SOL, but owner withdraw ignores this
      const withdrawAmount = new anchor.BN(0.8 * LAMPORTS_PER_SOL);
      const destBefore = await provider.connection.getBalance(destinationWallet.publicKey);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          destination: destinationWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const destAfter = await provider.connection.getBalance(destinationWallet.publicKey);
      expect(destAfter - destBefore).to.equal(withdrawAmount.toNumber());
    });

    it("owner can withdraw even when agent is frozen", async () => {
      // Freeze the agent
      await program.methods
        .freeze()
        .accounts({ cloakedAgentState: agentStatePda, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.frozen).to.equal(true);

      // Owner should still be able to withdraw
      const withdrawAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
      const destBefore = await provider.connection.getBalance(destinationWallet.publicKey);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          destination: destinationWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const destAfter = await provider.connection.getBalance(destinationWallet.publicKey);
      expect(destAfter - destBefore).to.equal(withdrawAmount.toNumber());
    });

    it("non-owner cannot withdraw", async () => {
      const nonOwner = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(nonOwner.publicKey, 0.1 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      try {
        await program.methods
          .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            owner: nonOwner.publicKey,
            destination: destinationWallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonOwner])
          .rpc();

        expect.fail("Should have failed with constraint error");
      } catch (error: any) {
        expect(error.toString()).to.satisfy((msg: string) =>
          msg.includes("NotOwner") ||
          msg.includes("not owner")
        );
      }
    });

    it("delegate cannot use withdraw (only spend)", async () => {
      try {
        await program.methods
          .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            owner: delegateKeypair.publicKey, // delegate trying as owner
            destination: destinationWallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair])
          .rpc();

        expect.fail("Should have failed");
      } catch (error: any) {
        expect(error.toString()).to.satisfy((msg: string) =>
          msg.includes("NotOwner") ||
          msg.includes("not owner")
        );
      }
    });

    it("fails when withdrawing more than balance", async () => {
      const excessiveAmount = new anchor.BN(2 * LAMPORTS_PER_SOL); // Only 1 SOL in vault

      try {
        await program.methods
          .withdraw(excessiveAmount)
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            owner: owner.publicKey,
            destination: destinationWallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();

        expect.fail("Should have failed with InsufficientBalance");
      } catch (error: any) {
        expect(error.message).to.include("InsufficientBalance");
      }
    });

    it("partial withdrawal keeps agent open", async () => {
      const withdrawAmount = new anchor.BN(0.3 * LAMPORTS_PER_SOL);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          destination: destinationWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Agent should still exist
      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.owner.toBase58()).to.equal(owner.publicKey.toBase58());

      // Vault should have remaining balance
      const vaultBalance = await provider.connection.getBalance(vaultPda);
      expect(vaultBalance).to.equal(0.7 * LAMPORTS_PER_SOL);
    });

    it("preserves privacy by allowing withdrawal to any wallet", async () => {
      // Create a random wallet (simulating anonymous destination)
      const anonymousWallet = Keypair.generate();

      await program.methods
        .withdraw(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          destination: anonymousWallet.publicKey, // Any wallet works
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const balance = await provider.connection.getBalance(anonymousWallet.publicKey);
      expect(balance).to.equal(0.5 * LAMPORTS_PER_SOL);
    });
  });

  // Helper to create a test SPL token mint (USDC-like, 6 decimals)
  async function createTestMint(
    connection: anchor.web3.Connection,
    payer: Keypair
  ): Promise<{ mint: PublicKey; mintAuthority: Keypair }> {
    const mintAuthority = payer;
    const mint = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      null,
      6
    );
    return { mint, mintAuthority };
  }

  describe("constraint edge cases", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;
    let destination: Keypair;
    let feePayer: Keypair;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();
      destination = Keypair.generate();
      feePayer = Keypair.generate();

      const sig1 = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig1);

      const sig2 = await provider.connection.requestAirdrop(feePayer.publicKey, 1 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig2);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );
    });

    it("respects daily limit across multiple transactions", async () => {
      // Create with 0.1 SOL daily limit
      await program.methods
        .createCloakedAgent(
          new anchor.BN(0),                        // unlimited per tx
          new anchor.BN(0.1 * LAMPORTS_PER_SOL),   // 0.1 daily
          new anchor.BN(0),                        // unlimited total
          new anchor.BN(0)
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // First spend: 0.06 SOL (should succeed)
      await program.methods
        .spend(new anchor.BN(0.06 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          destination: destination.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      // Second spend: 0.05 SOL (should fail - would exceed 0.1 daily)
      try {
        await program.methods
          .spend(new anchor.BN(0.05 * LAMPORTS_PER_SOL))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            destination: destination.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();

        expect.fail("Should have failed with ExceedsDailyLimit");
      } catch (error: any) {
        expect(error.message).to.include("ExceedsDailyLimit");
      }
    });

    it("blocks spending when frozen", async () => {
      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Freeze
      await program.methods
        .freeze()
        .accounts({ cloakedAgentState: agentStatePda, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      // Try to spend
      try {
        await program.methods
          .spend(new anchor.BN(0.01 * LAMPORTS_PER_SOL))
          .accounts({
            cloakedAgentState: agentStatePda,
            vault: vaultPda,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            destination: destination.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();

        expect.fail("Should have failed with AgentFrozen");
      } catch (error: any) {
        expect(error.message).to.include("AgentFrozen");
      }
    });

    it("unlimited constraints work (value 0)", async () => {
      // All limits set to 0 = unlimited
      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Should allow large spend
      await program.methods
        .spend(new anchor.BN(1.5 * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          destination: destination.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      const state = await program.account.cloakedAgentState.fetch(agentStatePda);
      expect(state.totalSpent.toNumber()).to.equal(1.5 * LAMPORTS_PER_SOL);
    });
  });

  // ======================================================================
  // TOKEN INSTRUCTION TESTS
  // ======================================================================

  describe("enable_token", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;

    beforeEach(async () => {
      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );
    });

    it("enables a token and creates ATA", async () => {
      // Create agent
      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Create test mint
      const { mint } = await createTestMint(provider.connection, owner);

      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      const maxPerTx = 1_000_000;
      const dailyLimit = 10_000_000;
      const totalLimit = 100_000_000;

      await program.methods
        .enableToken(
          new anchor.BN(maxPerTx),
          new anchor.BN(dailyLimit),
          new anchor.BN(totalLimit),
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Verify TokenVaultState
      const tokenState = await program.account.tokenVaultState.fetch(tokenVaultStatePda);
      expect(tokenState.agentState.toBase58()).to.equal(agentStatePda.toBase58());
      expect(tokenState.mint.toBase58()).to.equal(mint.toBase58());
      expect(tokenState.maxPerTx.toNumber()).to.equal(maxPerTx);
      expect(tokenState.dailyLimit.toNumber()).to.equal(dailyLimit);
      expect(tokenState.totalLimit.toNumber()).to.equal(totalLimit);
      expect(tokenState.totalSpent.toNumber()).to.equal(0);
      expect(tokenState.dailySpent.toNumber()).to.equal(0);

      // Verify ATA exists and is owned by vault PDA
      const ataAccount = await getAccount(provider.connection, vaultAta);
      expect(ataAccount.owner.toBase58()).to.equal(vaultPda.toBase58());
      expect(Number(ataAccount.amount)).to.equal(0);
    });

    it("fails if not owner", async () => {
      const nonOwner = Keypair.generate();
      const sig2 = await provider.connection.requestAirdrop(nonOwner.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig2);

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      try {
        await program.methods
          .enableToken(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            mint: mint,
            owner: nonOwner.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonOwner])
          .rpc();
        expect.fail("Should have failed with NotOwner");
      } catch (error: any) {
        expect(error.message).to.include("NotOwner");
      }
    });

    it("fails if private mode", async () => {
      // Create a private mode agent
      const dummyCommitment = Array(32).fill(1) as number[];
      await program.methods
        .createCloakedAgentPrivate(
          dummyCommitment,
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0),
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      try {
        await program.methods
          .enableToken(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            mint: mint,
            owner: owner.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have failed with IsPrivateMode");
      } catch (error: any) {
        expect(error.message).to.include("IsPrivateMode");
      }
    });
  });

  describe("spend_token", () => {
    let owner: Keypair;
    let delegateKeypair: Keypair;
    let feePayer: Keypair;
    let agentStatePda: PublicKey;
    let vaultPda: PublicKey;
    let mint: PublicKey;
    let mintAuthority: Keypair;
    let tokenVaultStatePda: PublicKey;
    let vaultAta: PublicKey;
    let destinationWallet: Keypair;

    async function setupTokenAgent(opts: {
      maxPerTx?: number;
      dailyLimit?: number;
      totalLimit?: number;
      mintAmount?: number;
      depositSol?: number;
    } = {}) {
      const {
        maxPerTx = 0,
        dailyLimit = 0,
        totalLimit = 0,
        mintAmount = 100_000_000, // 100 USDC
        depositSol = 0.1,
      } = opts;

      owner = Keypair.generate();
      delegateKeypair = Keypair.generate();
      feePayer = Keypair.generate();
      destinationWallet = Keypair.generate();

      const sig1 = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig1);
      const sig2 = await provider.connection.requestAirdrop(feePayer.publicKey, 1 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig2);

      [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      // Create agent
      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Deposit SOL for fee reimbursement
      await program.methods
        .deposit(new anchor.BN(depositSol * LAMPORTS_PER_SOL))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          depositor: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Create mint
      const result = await createTestMint(provider.connection, owner);
      mint = result.mint;
      mintAuthority = result.mintAuthority;

      [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      // Enable token with constraints
      await program.methods
        .enableToken(
          new anchor.BN(maxPerTx),
          new anchor.BN(dailyLimit),
          new anchor.BN(totalLimit),
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Mint tokens to vault ATA
      if (mintAmount > 0) {
        await mintTo(
          provider.connection,
          owner,
          mint,
          vaultAta,
          mintAuthority,
          mintAmount,
        );
      }
    }

    it("transfers tokens and reimburses fee payer", async () => {
      await setupTokenAgent();

      // Create destination ATA
      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      const feePayerBefore = await provider.connection.getBalance(feePayer.publicKey);
      const spendAmount = 5_000_000; // 5 USDC

      await program.methods
        .spendToken(new anchor.BN(spendAmount))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      // Verify destination received tokens
      const destAccount = await getAccount(provider.connection, destAta);
      expect(Number(destAccount.amount)).to.equal(spendAmount);

      // Verify fee payer received SPEND_FEE_REIMBURSEMENT
      const feePayerAfter = await provider.connection.getBalance(feePayer.publicKey);
      // Fee payer pays tx fee but gets 10_000 reimbursement, net should be positive
      expect(feePayerAfter - feePayerBefore + 5000).to.be.greaterThan(0); // ~5k tx fee, 10k reimbursement

      // Verify token_vault_state tracking updated
      const tokenState = await program.account.tokenVaultState.fetch(tokenVaultStatePda);
      expect(tokenState.dailySpent.toNumber()).to.equal(spendAmount);
      expect(tokenState.totalSpent.toNumber()).to.equal(spendAmount);
    });

    it("enforces per-tx limit", async () => {
      await setupTokenAgent({ maxPerTx: 1_000_000 }); // 1 USDC limit

      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      try {
        await program.methods
          .spendToken(new anchor.BN(2_000_000)) // 2 USDC, exceeds 1 USDC limit
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            destinationTokenAccount: destAta,
            mint: mint,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();
        expect.fail("Should have failed with ExceedsPerTxLimit");
      } catch (error: any) {
        expect(error.message).to.include("ExceedsPerTxLimit");
      }
    });

    it("enforces daily limit", async () => {
      await setupTokenAgent({ dailyLimit: 5_000_000 }); // 5 USDC daily

      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      // First spend: 3 USDC - should succeed
      await program.methods
        .spendToken(new anchor.BN(3_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      // Second spend: 3 USDC - should fail (3+3=6 > 5 daily)
      try {
        await program.methods
          .spendToken(new anchor.BN(3_000_000))
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            destinationTokenAccount: destAta,
            mint: mint,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();
        expect.fail("Should have failed with ExceedsDailyLimit");
      } catch (error: any) {
        expect(error.message).to.include("ExceedsDailyLimit");
      }
    });

    it("enforces total limit", async () => {
      await setupTokenAgent({ totalLimit: 10_000_000, depositSol: 0.5 }); // 10 USDC total

      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      // Spend 10 USDC (exactly at limit) - should succeed
      await program.methods
        .spendToken(new anchor.BN(10_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          delegate: delegateKeypair.publicKey,
          feePayer: feePayer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([delegateKeypair, feePayer])
        .rpc();

      // One more: 1 USDC - should fail (total would be 11 > 10)
      try {
        await program.methods
          .spendToken(new anchor.BN(1_000_000))
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            destinationTokenAccount: destAta,
            mint: mint,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();
        expect.fail("Should have failed with ExceedsTotalLimit");
      } catch (error: any) {
        expect(error.message).to.include("ExceedsTotalLimit");
      }
    });

    it("respects global frozen state", async () => {
      await setupTokenAgent();

      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      // Freeze the agent
      await program.methods
        .freeze()
        .accounts({ cloakedAgentState: agentStatePda, owner: owner.publicKey })
        .signers([owner])
        .rpc();

      try {
        await program.methods
          .spendToken(new anchor.BN(1_000_000))
          .accounts({
            cloakedAgentState: agentStatePda,
            tokenVaultState: tokenVaultStatePda,
            vault: vaultPda,
            vaultTokenAccount: vaultAta,
            destinationTokenAccount: destAta,
            mint: mint,
            delegate: delegateKeypair.publicKey,
            feePayer: feePayer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([delegateKeypair, feePayer])
          .rpc();
        expect.fail("Should have failed with AgentFrozen");
      } catch (error: any) {
        expect(error.message).to.include("AgentFrozen");
      }
    });
  });

  describe("withdraw_token", () => {
    it("owner can withdraw tokens", async () => {
      const owner = Keypair.generate();
      const delegateKeypair = Keypair.generate();
      const destinationWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint, mintAuthority } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      await program.methods
        .enableToken(new anchor.BN(1_000_000), new anchor.BN(5_000_000), new anchor.BN(10_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Mint 50 USDC to vault
      await mintTo(provider.connection, owner, mint, vaultAta, mintAuthority, 50_000_000);

      // Create destination ATA
      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      const withdrawAmount = 30_000_000; // 30 USDC

      await program.methods
        .withdrawToken(new anchor.BN(withdrawAmount))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const destAccount = await getAccount(provider.connection, destAta);
      expect(Number(destAccount.amount)).to.equal(withdrawAmount);

      // Vault should have remaining
      const vaultAccount = await getAccount(provider.connection, vaultAta);
      expect(Number(vaultAccount.amount)).to.equal(50_000_000 - withdrawAmount);
    });

    it("owner bypasses per-token constraints", async () => {
      const owner = Keypair.generate();
      const delegateKeypair = Keypair.generate();
      const destinationWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint, mintAuthority } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      // Enable with small maxPerTx of 1 USDC
      await program.methods
        .enableToken(new anchor.BN(1_000_000), new anchor.BN(5_000_000), new anchor.BN(10_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      await mintTo(provider.connection, owner, mint, vaultAta, mintAuthority, 50_000_000);

      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      // Owner withdraws 20 USDC - well above the 1 USDC maxPerTx
      const withdrawAmount = 20_000_000;

      await program.methods
        .withdrawToken(new anchor.BN(withdrawAmount))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const destAccount = await getAccount(provider.connection, destAta);
      expect(Number(destAccount.amount)).to.equal(withdrawAmount);
    });
  });

  describe("update_token_constraints", () => {
    it("owner can update token constraints", async () => {
      const owner = Keypair.generate();
      const delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      // Enable with initial constraints
      await program.methods
        .enableToken(new anchor.BN(1_000_000), new anchor.BN(5_000_000), new anchor.BN(50_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Update all constraints
      await program.methods
        .updateTokenConstraints(
          new anchor.BN(2_000_000),
          new anchor.BN(10_000_000),
          new anchor.BN(100_000_000),
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          mint: mint,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const tokenState = await program.account.tokenVaultState.fetch(tokenVaultStatePda);
      expect(tokenState.maxPerTx.toNumber()).to.equal(2_000_000);
      expect(tokenState.dailyLimit.toNumber()).to.equal(10_000_000);
      expect(tokenState.totalLimit.toNumber()).to.equal(100_000_000);
    });

    it("partial update preserves other fields", async () => {
      const owner = Keypair.generate();
      const delegateKeypair = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      await program.methods
        .enableToken(new anchor.BN(1_000_000), new anchor.BN(5_000_000), new anchor.BN(50_000_000))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Update only dailyLimit, pass null for the others
      await program.methods
        .updateTokenConstraints(
          null,
          new anchor.BN(20_000_000),
          null,
        )
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          mint: mint,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const tokenState = await program.account.tokenVaultState.fetch(tokenVaultStatePda);
      expect(tokenState.maxPerTx.toNumber()).to.equal(1_000_000); // unchanged
      expect(tokenState.dailyLimit.toNumber()).to.equal(20_000_000); // updated
      expect(tokenState.totalLimit.toNumber()).to.equal(50_000_000); // unchanged
    });
  });

  describe("disable_token", () => {
    it("disables token, returns remaining tokens and closes accounts", async () => {
      const owner = Keypair.generate();
      const delegateKeypair = Keypair.generate();
      const destinationWallet = Keypair.generate();

      const sig = await provider.connection.requestAirdrop(owner.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);

      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
        program.programId
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        program.programId
      );

      await program.methods
        .createCloakedAgent(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          vault: vaultPda,
          owner: owner.publicKey,
          delegate: delegateKeypair.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const { mint, mintAuthority } = await createTestMint(provider.connection, owner);
      const [tokenVaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        program.programId
      );
      const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true);

      await program.methods
        .enableToken(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Mint 25 USDC to vault
      await mintTo(provider.connection, owner, mint, vaultAta, mintAuthority, 25_000_000);

      // Create destination ATA for remaining tokens
      const destAta = await createAssociatedTokenAccount(
        provider.connection,
        owner,
        mint,
        destinationWallet.publicKey,
      );

      // Disable token
      await program.methods
        .disableToken()
        .accounts({
          cloakedAgentState: agentStatePda,
          tokenVaultState: tokenVaultStatePda,
          vault: vaultPda,
          vaultTokenAccount: vaultAta,
          destinationTokenAccount: destAta,
          mint: mint,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Verify destination received all remaining tokens
      const destAccount = await getAccount(provider.connection, destAta);
      expect(Number(destAccount.amount)).to.equal(25_000_000);

      // Verify TokenVaultState account is closed
      const tokenStateInfo = await provider.connection.getAccountInfo(tokenVaultStatePda);
      expect(tokenStateInfo).to.be.null;

      // Verify vault ATA is closed
      const vaultAtaInfo = await provider.connection.getAccountInfo(vaultAta);
      expect(vaultAtaInfo).to.be.null;
    });
  });
});
