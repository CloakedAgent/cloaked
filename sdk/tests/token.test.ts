import { expect } from "chai";
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { CloakedAgent, CLOAKED_PROGRAM_ID } from "../src";

describe("CloakedAgent", () => {
  // Test constants
  const TEST_RPC_URL = "https://api.devnet.solana.com";

  // Generate a test keypair and its base58 agent key
  let testKeypair: Keypair;
  let agentKey: string;

  beforeEach(() => {
    testKeypair = Keypair.generate();
    agentKey = bs58.encode(testKeypair.secretKey);
  });

  describe("constructor", () => {
    it("creates an agent from valid base58 agent key", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      expect(agent).to.be.instanceOf(CloakedAgent);
    });

    it("throws error for invalid agent key", () => {
      expect(() => new CloakedAgent("invalid-agent-key!", TEST_RPC_URL)).to.throw();
    });
  });

  describe("publicKey", () => {
    it("returns the correct public key from agent key", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      expect(agent.publicKey.toBase58()).to.equal(testKeypair.publicKey.toBase58());
    });
  });

  describe("pda (legacy)", () => {
    it("returns PDA derived from agent public key", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);

      // Calculate expected legacy PDA (seeds = ["token", delegate])
      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token"), testKeypair.publicKey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      expect(agent.pda.toBase58()).to.equal(expectedPda.toBase58());
    });

    it("PDA derivation is deterministic", () => {
      const agent1 = new CloakedAgent(agentKey, TEST_RPC_URL);
      const agent2 = new CloakedAgent(agentKey, TEST_RPC_URL);

      expect(agent1.pda.toBase58()).to.equal(agent2.pda.toBase58());
    });
  });

  describe("bump", () => {
    it("returns the correct bump seed for PDA", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);

      // Calculate expected bump
      const [, expectedBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("token"), testKeypair.publicKey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      expect(agent.bump).to.equal(expectedBump);
    });
  });

  describe("getBalance", () => {
    it("returns 0 for unfunded vault", async () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      const balance = await agent.getBalance();
      expect(balance).to.equal(0);
    });
  });

  describe("static methods", () => {
    it("generate() creates a new random agent", () => {
      const { agent, agentKey: key } = CloakedAgent.generate(TEST_RPC_URL);

      expect(agent).to.be.instanceOf(CloakedAgent);
      expect(key).to.be.a("string");
      expect(key.length).to.be.greaterThan(0);

      // Agent key should be valid base58
      expect(() => bs58.decode(key)).to.not.throw();
    });

    it("derivePda() returns correct PDA for any public key", () => {
      const randomPubkey = Keypair.generate().publicKey;

      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token"), randomPubkey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      const derivedPda = CloakedAgent.derivePda(randomPubkey);
      expect(derivedPda.toBase58()).to.equal(expectedPda.toBase58());
    });

    it("deriveAgentStatePda() returns correct PDA for delegate", () => {
      const delegate = Keypair.generate().publicKey;

      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegate.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      const derivedPda = CloakedAgent.deriveAgentStatePda(delegate);
      expect(derivedPda.toBase58()).to.equal(expectedPda.toBase58());
    });

    it("deriveVaultPda() returns correct PDA for agent state", () => {
      const delegate = Keypair.generate().publicKey;
      const agentStatePda = CloakedAgent.deriveAgentStatePda(delegate);

      const [expectedVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      const derivedVault = CloakedAgent.deriveVaultPda(agentStatePda);
      expect(derivedVault.toBase58()).to.equal(expectedVault.toBase58());
    });
  });

  describe("agent state PDAs", () => {
    it("agentStatePda is derived from delegate public key", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);

      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), testKeypair.publicKey.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      expect(agent.agentStatePda.toBase58()).to.equal(expectedPda.toBase58());
    });

    it("vaultPda is derived from agentStatePda", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      const agentStatePda = agent.agentStatePda;

      const [expectedVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      expect(agent.vaultPda.toBase58()).to.equal(expectedVault.toBase58());
    });

    it("vaultPda derivation is deterministic", () => {
      const agent1 = new CloakedAgent(agentKey, TEST_RPC_URL);
      const agent2 = new CloakedAgent(agentKey, TEST_RPC_URL);

      expect(agent1.vaultPda.toBase58()).to.equal(agent2.vaultPda.toBase58());
    });
  });

  describe("withdraw method signature", () => {
    it("withdraw method exists on CloakedAgent", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      expect(agent.withdraw).to.be.a("function");
    });

    it("withdraw method has correct arity (3 params: owner, amount, destination)", () => {
      const agent = new CloakedAgent(agentKey, TEST_RPC_URL);
      expect(agent.withdraw.length).to.equal(3);
    });
  });
});
