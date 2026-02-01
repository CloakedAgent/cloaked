/**
 * E2E Test for Private Mode ZK Proof Verification
 *
 * Prerequisites:
 * 1. Backend running: cd backend && npm run dev
 * 2. Attestation Verifier deployed: G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F
 * 3. Cloaked program deployed: 3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB
 *
 * Run: npx ts-node tests/private-mode-e2e.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cloaked } from "../target/types/cloaked";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Attestation Verifier Program ID (hybrid client-side proving)
const ZK_VERIFIER_PROGRAM_ID = new PublicKey(
  "G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F"
);

// Cloaked Program ID
const CLOAKED_PROGRAM_ID = new PublicKey(
  "3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB"
);

// Backend URL
const BACKEND_URL = "http://localhost:3645";

interface ProofResult {
  proofBytes: number[];
  witnessBytes: number[];
}

// Poseidon hash function (using circomlibjs)
async function poseidonHash(input: bigint): Promise<bigint> {
  const circomlibjs = await import("circomlibjs" as any);
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const hash = poseidon([F.e(input)]);
  return BigInt(F.toString(hash));
}

// Generate ZK proof via backend
async function generateProof(
  agentSecret: bigint,
  commitment: bigint
): Promise<ProofResult> {
  const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

  const response = await fetch(`${BACKEND_URL}/api/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentSecret: agentSecret.toString(),
      commitment: commitmentHex,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Proof generation failed: ${JSON.stringify(error)}`);
  }

  return response.json() as Promise<ProofResult>;
}

// Convert commitment to 32-byte array
function commitmentToBytes(commitment: bigint): number[] {
  const bytes = new Array(32).fill(0);
  let value = commitment;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return bytes;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Private Mode E2E Test");
  console.log("=".repeat(60));

  // Setup connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load wallet
  const walletPath = path.join(
    process.env.HOME || "",
    ".config/solana/id.json"
  );
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  console.log("Wallet:", walletKeypair.publicKey.toBase58());

  // Setup Anchor
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(
    fs.readFileSync("target/idl/cloaked.json", "utf-8")
  );
  const program = new Program(idl, provider) as Program<Cloaked>;

  // Generate agent secret and commitment
  const agentSecret = BigInt(Date.now()); // Random secret based on timestamp
  console.log("\n1. Generating commitment...");
  const commitment = await poseidonHash(agentSecret);
  console.log("   Agent secret: <redacted>");
  console.log("   Commitment:", "0x" + commitment.toString(16).slice(0, 16) + "...");

  // Generate delegate keypair
  const delegateKeypair = Keypair.generate();
  console.log("   Delegate:", delegateKeypair.publicKey.toBase58());

  // Derive PDAs
  const [agentStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("cloaked_agent_state"), delegateKeypair.publicKey.toBuffer()],
    CLOAKED_PROGRAM_ID
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agentStatePda.toBuffer()],
    CLOAKED_PROGRAM_ID
  );
  console.log("   AgentState PDA:", agentStatePda.toBase58());

  // 2. Create private agent
  console.log("\n2. Creating private agent...");
  const commitmentBytes = commitmentToBytes(commitment);

  try {
    const createTx = await program.methods
      .createCloakedAgentPrivate(
        commitmentBytes,
        new anchor.BN(0), // max_per_tx (unlimited)
        new anchor.BN(0), // daily_limit (unlimited)
        new anchor.BN(0), // total_limit (unlimited)
        new anchor.BN(0)  // expires_at (never)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        delegate: delegateKeypair.publicKey,
        payer: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Created:", createTx.slice(0, 20) + "...");
  } catch (e: any) {
    console.error("   ❌ Failed to create:", e.message);
    return;
  }

  // Verify agent state
  const agentState = await program.account.cloakedAgentState.fetch(agentStatePda);
  console.log("   Owner:", agentState.owner ? (agentState.owner as PublicKey).toBase58() : "None (private mode)");
  console.log("   Frozen:", agentState.frozen);

  // 3. Deposit some SOL to cover fees
  console.log("\n3. Depositing SOL to vault...");
  try {
    const depositTx = await program.methods
      .deposit(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        depositor: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   ✅ Deposited 0.1 SOL:", depositTx.slice(0, 20) + "...");
  } catch (e: any) {
    console.error("   ❌ Deposit failed:", e.message);
    return;
  }

  // 4. Generate ZK proof
  console.log("\n4. Generating ZK proof via backend...");
  let proof: ProofResult;
  try {
    proof = await generateProof(agentSecret, commitment);
    console.log("   ✅ Proof generated");
    console.log("   proofBytes length:", proof.proofBytes.length);
    console.log("   witnessBytes length:", proof.witnessBytes.length);
  } catch (e: any) {
    console.error("   ❌ Proof generation failed:", e.message);
    console.error("   Make sure backend is running: cd backend && npm run dev");
    return;
  }

  // 5. Call freeze_private with ZK proof
  console.log("\n5. Calling freeze_private with ZK proof...");
  try {
    const freezeTx = await program.methods
      .freezePrivate(
        Buffer.from(proof.proofBytes),
        Buffer.from(proof.witnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: walletKeypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Frozen:", freezeTx.slice(0, 20) + "...");
  } catch (e: any) {
    console.error("   ❌ freeze_private failed:", e.message);
    if (e.logs) {
      console.error("   Logs:", e.logs.slice(-5));
    }
    return;
  }

  // Verify frozen state
  const frozenState = await program.account.cloakedAgentState.fetch(agentStatePda);
  console.log("   Agent frozen:", frozenState.frozen);

  if (frozenState.frozen) {
    console.log("\n" + "=".repeat(60));
    console.log("🎉 SUCCESS: Private mode ZK verification working!");
    console.log("=".repeat(60));
  } else {
    console.log("\n❌ FAILED: Agent should be frozen");
  }

  // 6. Test unfreeze_private
  console.log("\n6. Calling unfreeze_private with ZK proof...");
  try {
    // Generate fresh proof for unfreeze
    const unfreezeProof = await generateProof(agentSecret, commitment);

    const unfreezeTx = await program.methods
      .unfreezePrivate(
        Buffer.from(unfreezeProof.proofBytes),
        Buffer.from(unfreezeProof.witnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: walletKeypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Unfrozen:", unfreezeTx.slice(0, 20) + "...");

    const unfrozenState = await program.account.cloakedAgentState.fetch(agentStatePda);
    console.log("   Agent frozen:", unfrozenState.frozen);
  } catch (e: any) {
    console.error("   ❌ unfreeze_private failed:", e.message);
  }

  // 7. Test invalid proof rejection
  console.log("\n7. Testing invalid proof rejection...");
  try {
    // Create a fake proof with random bytes (324 bytes like real proof)
    const fakeProofBytes = Array(324).fill(0).map(() => Math.floor(Math.random() * 256));
    // Fake witness with correct format but wrong commitment
    const fakeWitnessBytes = [
      0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,  // 12-byte header
      ...commitmentBytes  // Use correct commitment so it passes commitment check but fails proof verify
    ];

    await program.methods
      .freezePrivate(
        Buffer.from(fakeProofBytes),
        Buffer.from(fakeWitnessBytes)
      )
      .accounts({
        cloakedAgentState: agentStatePda,
        vault: vaultPda,
        feeRecipient: walletKeypair.publicKey,
        zkVerifier: ZK_VERIFIER_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ❌ SECURITY ISSUE: Invalid proof was accepted!");
  } catch (e: any) {
    console.log("   ✅ Invalid proof correctly rejected");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
