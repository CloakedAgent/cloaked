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
});
