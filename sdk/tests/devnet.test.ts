import { CloakedAgent } from "../src/agent";
import { handleBalance, handleStatus } from "../src/mcp/tools";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { expect } from "chai";

const RPC_URL = "https://api.devnet.solana.com";

describe("Devnet Integration", () => {
  describe("CloakedAgent basic operations", () => {
    it("generates a new agent with valid PDAs", () => {
      const { agent, agentKey } = CloakedAgent.generate(RPC_URL);
      expect(agent.publicKey.toBase58()).to.have.length(44);
      expect(agent.vaultPda.toBase58()).to.have.length(44);
      expect(agent.agentStatePda.toBase58()).to.have.length(44);
    });

    it("destroy() clears agent state", () => {
      const keypair = Keypair.generate();
      const agent = new CloakedAgent(bs58.encode(keypair.secretKey), RPC_URL);
      
      expect((agent as any).keypair).to.not.be.null;
      
      agent.destroy();
      
      expect((agent as any).keypair).to.be.null;
      expect((agent as any)._agentSecret).to.be.null;
      expect((agent as any)._nonce).to.be.null;
    });
  });

  describe("MCP tools error handling", () => {
    it("handleBalance throws sanitized error without agent key", async () => {
      // Clear any env variable
      const originalKey = process.env.CLOAKED_AGENT_KEY;
      delete process.env.CLOAKED_AGENT_KEY;
      
      try {
        await handleBalance();
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("CLOAKED_AGENT_KEY not set");
        // Should NOT contain any base58 keys (32+ chars)
        const hasKey = /[1-9A-HJ-NP-Za-km-z]{32,}/.test(error.message);
        expect(hasKey).to.be.false;
      } finally {
        if (originalKey) process.env.CLOAKED_AGENT_KEY = originalKey;
      }
    });

    it("handleStatus throws sanitized error without agent key", async () => {
      const originalKey = process.env.CLOAKED_AGENT_KEY;
      delete process.env.CLOAKED_AGENT_KEY;
      
      try {
        await handleStatus();
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).to.include("CLOAKED_AGENT_KEY not set");
      } finally {
        if (originalKey) process.env.CLOAKED_AGENT_KEY = originalKey;
      }
    });
  });
});
