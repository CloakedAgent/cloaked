import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { CloakedAgent, CLOAKED_PROGRAM_ID } from "../src";
import { KNOWN_TOKENS, USDC_MINT_MAINNET, USDC_MINT_DEVNET } from "../src/constants";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const TEST_RPC_URL = "https://api.devnet.solana.com";

describe("Token Support", () => {
  let testKeypair: Keypair;
  let agentKey: string;
  let agent: CloakedAgent;

  beforeEach(() => {
    testKeypair = Keypair.generate();
    agentKey = bs58.encode(testKeypair.secretKey);
    agent = new CloakedAgent(agentKey, TEST_RPC_URL);
  });

  describe("known tokens", () => {
    it("USDC mainnet mint is defined", () => {
      expect(USDC_MINT_MAINNET.toBase58()).to.equal("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    });

    it("USDC devnet mint is defined", () => {
      expect(USDC_MINT_DEVNET.toBase58()).to.equal("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    });

    it("KNOWN_TOKENS resolves USDC mainnet", () => {
      const token = KNOWN_TOKENS["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"];
      expect(token).to.not.be.undefined;
      expect(token.symbol).to.equal("USDC");
      expect(token.decimals).to.equal(6);
      expect(token.name).to.equal("USD Coin");
    });

    it("KNOWN_TOKENS resolves USDC devnet", () => {
      const token = KNOWN_TOKENS["4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"];
      expect(token).to.not.be.undefined;
      expect(token.symbol).to.equal("USDC");
      expect(token.decimals).to.equal(6);
    });

    it("unknown mint returns undefined from KNOWN_TOKENS", () => {
      const token = KNOWN_TOKENS["11111111111111111111111111111111"];
      expect(token).to.be.undefined;
    });
  });

  describe("deriveTokenVaultStatePda", () => {
    it("returns deterministic PDA from agent state and mint", () => {
      const agentStatePda = agent.agentStatePda;
      const mint = USDC_MINT_MAINNET;

      const [expectedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault_state"), agentStatePda.toBuffer(), mint.toBuffer()],
        CLOAKED_PROGRAM_ID
      );

      const derived = CloakedAgent.deriveTokenVaultStatePda(agentStatePda, mint);
      expect(derived.toBase58()).to.equal(expectedPda.toBase58());
    });

    it("different mints produce different PDAs", () => {
      const agentStatePda = agent.agentStatePda;
      const pda1 = CloakedAgent.deriveTokenVaultStatePda(agentStatePda, USDC_MINT_MAINNET);
      const pda2 = CloakedAgent.deriveTokenVaultStatePda(agentStatePda, USDC_MINT_DEVNET);
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("different agents produce different PDAs for same mint", () => {
      const agent2 = new CloakedAgent(bs58.encode(Keypair.generate().secretKey), TEST_RPC_URL);
      const pda1 = CloakedAgent.deriveTokenVaultStatePda(agent.agentStatePda, USDC_MINT_MAINNET);
      const pda2 = CloakedAgent.deriveTokenVaultStatePda(agent2.agentStatePda, USDC_MINT_MAINNET);
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });
  });

  describe("getTokenDepositAddress", () => {
    it("returns deterministic ATA for vault PDA and mint", () => {
      const mint = USDC_MINT_MAINNET;
      const expectedAta = getAssociatedTokenAddressSync(mint, agent.vaultPda, true);
      const ata = agent.getTokenDepositAddress(mint);
      expect(ata.toBase58()).to.equal(expectedAta.toBase58());
    });

    it("different mints produce different ATAs", () => {
      const ata1 = agent.getTokenDepositAddress(USDC_MINT_MAINNET);
      const ata2 = agent.getTokenDepositAddress(USDC_MINT_DEVNET);
      expect(ata1.toBase58()).to.not.equal(ata2.toBase58());
    });
  });

  describe("token method existence", () => {
    it("has enableToken method", () => {
      expect(agent.enableToken).to.be.a("function");
    });

    it("has spendToken method", () => {
      expect(agent.spendToken).to.be.a("function");
    });

    it("has withdrawToken method", () => {
      expect(agent.withdrawToken).to.be.a("function");
    });

    it("has updateTokenConstraints method", () => {
      expect(agent.updateTokenConstraints).to.be.a("function");
    });

    it("has disableToken method", () => {
      expect(agent.disableToken).to.be.a("function");
    });

    it("has getTokenBalance method", () => {
      expect(agent.getTokenBalance).to.be.a("function");
    });

    it("has getTokenState method", () => {
      expect(agent.getTokenState).to.be.a("function");
    });

    it("has getEnabledTokens method", () => {
      expect(agent.getEnabledTokens).to.be.a("function");
    });
  });
});
