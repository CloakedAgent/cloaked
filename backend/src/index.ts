import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { PublicKey, Connection } from "@solana/web3.js";
import dotenv from "dotenv";

import { TokenService } from "./tokens";
import {
  generateRecursiveProof,
  verifyRecursiveProverSetup,
  type RecursiveProofInput,
} from "./recursive-prover";
import {
  generateAttestationProof,
  verifyAttestationProverSetup,
  type AttestationInput,
} from "./attestation-prover";
import {
  initRelayer,
  getRelayer,
  RelayerService,
  CreatePrivateAgentParams,
  PrivateOperationParams,
  UpdateConstraintsPrivateParams,
  WithdrawPrivateParams,
  ClosePrivateParams,
  SpendCosignParams,
  CREATION_FEE,
  MIN_DEPOSIT,
  parseCloakedError,
} from "./relayer";
import { initPersistence } from "./persistence";
import { createX402TestRoutes } from "./x402-test/routes";

// Load environment variables
dotenv.config();

// ============================================
// Configuration
// ============================================

const PORT = process.env.PORT || 3645;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// ============================================
// Services
// ============================================

initPersistence();

const tokenService = new TokenService(RPC_URL);

// Initialize relayer if private key is configured
if (RELAYER_PRIVATE_KEY) {
  initRelayer(RELAYER_PRIVATE_KEY, RPC_URL);
}

// ============================================
// Express App
// ============================================

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, false);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: "1mb" }));

// ============================================
// API Rate Limiting (protects RPC from abuse)
// ============================================

interface ApiRateLimitEntry {
  count: number;
  resetAt: number;
}

const apiRateLimitMap = new Map<string, ApiRateLimitEntry>();
const API_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const API_RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function checkApiRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = apiRateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    apiRateLimitMap.set(ip, { count: 1, resetAt: now + API_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: API_RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= API_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: API_RATE_LIMIT_MAX - entry.count };
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of apiRateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      apiRateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ============================================
// Error Sanitization
// ============================================

/**
 * Sanitize error messages before returning to clients.
 * Prevents exposing internal paths, stack traces, or implementation details.
 */
function sanitizeErrorForClient(error: unknown): string {
  if (!(error instanceof Error)) return "An unexpected error occurred";

  const msg = error.message;

  // Allow through user-facing validation/business logic errors
  const safePatterns = [
    /rate limit/i,
    /deposit/i,
    /minimum/i,
    /fee payer/i,
    /invalid.*address/i,
    /missing.*required/i,
    /agent not found/i,
    /expired/i,
    /frozen/i,
    /insufficient/i,
    /constraint/i,
    /verification failed/i,
    /commitment/i,
  ];

  for (const pattern of safePatterns) {
    if (pattern.test(msg)) return msg;
  }

  // Generic message for internal errors (file paths, RPC errors, etc.)
  return "An internal error occurred. Please try again.";
}

// ============================================
// Validation Helpers
// ============================================

interface PrivateOpValidation {
  relayer: RelayerService;
  agentStatePda: string;
  proofBytes: number[];
  witnessBytes: number[];
  clientIp: string;
}

/**
 * Validate common fields for private operation endpoints.
 * Returns validated data or null if validation failed (response already sent).
 */
function validatePrivateOp(req: Request, res: Response): PrivateOpValidation | null {
  const relayer = getRelayer();
  if (!relayer) {
    res.status(503).json({ error: "Relayer not configured" });
    return null;
  }

  const { agentStatePda, proofBytes, witnessBytes } = req.body;

  if (!agentStatePda || typeof agentStatePda !== "string") {
    res.status(400).json({ error: "Missing or invalid agentStatePda" });
    return null;
  }
  if (!proofBytes || !Array.isArray(proofBytes)) {
    res.status(400).json({ error: "Missing or invalid proofBytes" });
    return null;
  }
  if (!witnessBytes || !Array.isArray(witnessBytes)) {
    res.status(400).json({ error: "Missing or invalid witnessBytes" });
    return null;
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  return { relayer, agentStatePda, proofBytes, witnessBytes, clientIp };
}

/**
 * Common error handler for private operations
 */
function handlePrivateOpError(res: Response, error: unknown, operation: string): void {
  console.error(`[relayer] Error ${operation}:`, error);
  if (error instanceof Error && error.message.includes("Rate limit")) {
    res.status(429).json({ error: error.message });
    return;
  }
  res.status(500).json({
    error: `Failed to ${operation}`,
    details: sanitizeErrorForClient(error),
  });
}

// ============================================
// Health & Config API
// ============================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: "1.0.0",
  });
});

/**
 * GET /api/config
 * Get configuration (program ID only - RPC URL is private)
 */
app.get("/api/config", (req: Request, res: Response) => {
  res.json({
    programId: "3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB",
  });
});

// ============================================
// RPC Proxy
// ============================================

const rpcRateLimitMap = new Map<string, ApiRateLimitEntry>();
const RPC_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RPC_RATE_LIMIT_MAX = 100;

function checkRpcRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rpcRateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rpcRateLimitMap.set(ip, { count: 1, resetAt: now + RPC_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RPC_RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RPC_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RPC_RATE_LIMIT_MAX - entry.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rpcRateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rpcRateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/rpc
 * Proxy JSON-RPC requests to Solana RPC
 */
app.post("/api/rpc", async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const rateLimit = checkRpcRateLimit(clientIp);

  if (!rateLimit.allowed) {
    res.status(429).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Rate limit exceeded. Try again in a minute." },
      id: req.body?.id || null,
    });
    return;
  }

  // Validate JSON-RPC format
  const body = req.body;
  const isBatch = Array.isArray(body);
  const requests = isBatch ? body : [body];

  for (const request of requests) {
    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid JSON-RPC version" },
        id: request?.id || null,
      });
      return;
    }
    if (!request.method || typeof request.method !== "string") {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Missing or invalid method" },
        id: request?.id || null,
      });
      return;
    }
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("[rpc-proxy] Error forwarding request:", error);
    res.status(502).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "RPC proxy error" },
      id: body?.id || null,
    });
  }
});

/**
 * GET /api/price
 * Get current SOL/USD price (mock for now)
 */
app.get("/api/price", (req: Request, res: Response) => {
  // Mock price - in production use Pyth or similar
  const mockPrice = 150.0;
  res.json({
    sol_usd: mockPrice,
    source: "mock",
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// ZK Proof Generation API
// ============================================

/**
 * GET /api/prover/status
 * Check if attestation prover toolchain is available
 */
app.get("/api/prover/status", async (req: Request, res: Response): Promise<void> => {
  const status = await verifyAttestationProverSetup();
  res.json(status);
});

/**
 * GET /api/prover/recursive/status
 * Check if recursive prover toolchain is available
 */
app.get("/api/prover/recursive/status", async (req: Request, res: Response): Promise<void> => {
  const status = await verifyRecursiveProverSetup();
  res.json(status);
});

/**
 * POST /api/prove/recursive
 * Generate recursive Groth16 proof from UltraHonk proof artifacts
 *
 * This endpoint verifies an UltraHonk proof (from browser) inside a recursive
 * circuit and outputs a Groth16 proof for Solana. The agent_secret NEVER
 * reaches this service - only the proof artifacts.
 *
 * Body:
 *   verificationKey: string[] - VK for ownership_proof circuit (115 fields)
 *   proof: string[] - UltraHonk proof as fields (457 fields)
 *   vkHash: string - Hash of VK (hex with 0x prefix)
 *   commitment: string - The public commitment (hex with 0x prefix)
 *
 * Returns:
 *   proofBytes: number[] - 324 bytes (Groth16)
 *   witnessBytes: number[] - Witness bytes
 */
app.post("/api/prove/recursive", async (req: Request, res: Response): Promise<void> => {
  const { verificationKey, proof, vkHash, commitment } = req.body;

  // Validate verificationKey
  if (!verificationKey || !Array.isArray(verificationKey)) {
    res.status(400).json({ error: "Missing or invalid verificationKey array" });
    return;
  }
  if (verificationKey.length !== 115) {
    res.status(400).json({
      error: `verificationKey must have 115 fields, got ${verificationKey.length}`,
    });
    return;
  }

  // Validate proof
  if (!proof || !Array.isArray(proof)) {
    res.status(400).json({ error: "Missing or invalid proof array" });
    return;
  }
  if (proof.length !== 457) {
    res.status(400).json({
      error: `proof must have 457 fields, got ${proof.length}`,
    });
    return;
  }

  // Validate vkHash
  if (!vkHash || typeof vkHash !== "string") {
    res.status(400).json({ error: "Missing or invalid vkHash" });
    return;
  }
  if (!vkHash.startsWith("0x")) {
    res.status(400).json({ error: "vkHash must have 0x prefix" });
    return;
  }

  // Validate commitment
  if (!commitment || typeof commitment !== "string") {
    res.status(400).json({ error: "Missing or invalid commitment" });
    return;
  }
  if (!commitment.startsWith("0x") || commitment.length !== 66) {
    res.status(400).json({
      error: "Commitment must be 32-byte hex string with 0x prefix (66 chars)",
    });
    return;
  }

  try {
    const input: RecursiveProofInput = {
      verificationKey,
      proof,
      vkHash,
      commitment,
    };

    console.log("[prove-recursive] Starting recursive proof generation...");
    const result = await generateRecursiveProof(input);
    console.log("[prove-recursive] Proof generated successfully");

    res.json(result);
  } catch (error) {
    console.error("[prove-recursive] Error generating proof:", error);
    res.status(500).json({
      error: "Failed to generate recursive proof",
      details: sanitizeErrorForClient(error),
    });
  }
});

// ============================================
// Attestation Prover API (Option 1 Hybrid)
// ============================================

/**
 * GET /api/prover/attestation/status
 * Check if attestation prover is ready
 */
app.get(
  "/api/prover/attestation/status",
  async (_req: Request, res: Response): Promise<void> => {
    const status = await verifyAttestationProverSetup();
    res.json(status);
  }
);

/**
 * POST /api/prove/attestation
 *
 * Hybrid approach for client-side privacy:
 * 1. Browser generates UltraHonk proof (secret stays local)
 * 2. Backend verifies UltraHonk proof using bb.js
 * 3. If valid, backend generates simple Groth16 attestation proof
 *
 * Security: Agent secret NEVER leaves the browser!
 */
app.post(
  "/api/prove/attestation",
  async (req: Request, res: Response): Promise<void> => {
    const { proofBytes, publicInputs } = req.body as {
      proofBytes?: number[];
      publicInputs?: string[];
    };

    // Validate proofBytes
    if (!proofBytes || !Array.isArray(proofBytes)) {
      res.status(400).json({ error: "Missing or invalid proofBytes array" });
      return;
    }

    // Validate publicInputs
    if (!publicInputs || !Array.isArray(publicInputs)) {
      res.status(400).json({ error: "Missing or invalid publicInputs array" });
      return;
    }
    if (publicInputs.length !== 1) {
      res.status(400).json({
        error: `Expected 1 public input (commitment), got ${publicInputs.length}`,
      });
      return;
    }

    // Validate commitment format
    const commitment = publicInputs[0];
    if (!commitment.startsWith("0x") || commitment.length !== 66) {
      res.status(400).json({
        error: "Commitment must be 32-byte hex string with 0x prefix (66 chars)",
      });
      return;
    }

    try {
      const input: AttestationInput = {
        proofBytes,
        publicInputs,
      };

      console.log("[prove-attestation] Starting attestation proof generation...");
      const result = await generateAttestationProof(input);
      console.log("[prove-attestation] Attestation proof generated successfully");

      res.json(result);
    } catch (error) {
      console.error("[prove-attestation] Error generating proof:", error);
      res.status(500).json({
        error: "Failed to generate attestation proof",
        details: sanitizeErrorForClient(error),
      });
    }
  }
);

// ============================================
// Token State API
// ============================================

/**
 * GET /api/tokens?owner=<wallet>
 * List all tokens owned by a wallet
 */
app.get("/api/tokens", async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const rateLimit = checkApiRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
    return;
  }

  const { owner } = req.query;

  if (!owner || typeof owner !== "string") {
    res.status(400).json({ error: "Missing or invalid owner parameter" });
    return;
  }

  try {
    const ownerPubkey = new PublicKey(owner);
    const tokens = await tokenService.getAgentsByOwner(ownerPubkey);

    res.json({
      owner,
      count: tokens.length,
      tokens,
    });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    res.status(400).json({
      error: "Invalid owner address",
    });
  }
});

/**
 * GET /api/tokens/:address
 * Get single agent details by CloakedAgentState PDA address
 */
app.get(
  "/api/tokens/:address",
  async (req: Request, res: Response): Promise<void> => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimit = checkApiRateLimit(clientIp);
    if (!rateLimit.allowed) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      return;
    }

    const { address } = req.params;

    try {
      const agentStatePda = new PublicKey(address);
      const token = await tokenService.getAgent(agentStatePda);

      if (!token) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      res.json({ token });
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(400).json({
        error: "Invalid agent address",
      });
    }
  }
);

/**
 * GET /api/tokens/:address/history
 * Get spending history for an agent
 */
app.get(
  "/api/tokens/:address/history",
  async (req: Request, res: Response): Promise<void> => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimit = checkApiRateLimit(clientIp);
    if (!rateLimit.allowed) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      return;
    }

    const { address } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    try {
      const agentStatePda = new PublicKey(address);

      // First verify the agent exists
      const token = await tokenService.getAgent(agentStatePda);
      if (!token) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const history = await tokenService.getAgentHistory(agentStatePda, limit);

      res.json({
        token: address,
        count: history.length,
        transactions: history,
      });
    } catch (error) {
      console.error("Error fetching agent history:", error);
      res.status(400).json({
        error: "Invalid agent address",
      });
    }
  }
);

/**
 * GET /api/tokens/delegate/:delegate
 * Get agent by delegate public key (convenience endpoint for agents)
 */
app.get(
  "/api/tokens/delegate/:delegate",
  async (req: Request, res: Response): Promise<void> => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimit = checkApiRateLimit(clientIp);
    if (!rateLimit.allowed) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      return;
    }

    const { delegate } = req.params;

    try {
      const delegatePubkey = new PublicKey(delegate);
      const token = await tokenService.getAgentByDelegate(delegatePubkey);

      if (!token) {
        res.status(404).json({ error: "Agent not found for delegate" });
        return;
      }

      res.json({ token });
    } catch (error) {
      console.error("Error fetching agent by delegate:", error);
      res.status(400).json({
        error: "Invalid delegate address",
      });
    }
  }
);

// ============================================
// Relayer API (Truly Private Agent Creation)
// ============================================

/**
 * GET /api/relayer/pubkey
 * Get relayer public key (no RPC required - for spend operations)
 */
app.get("/api/relayer/pubkey", (req: Request, res: Response): void => {
  const relayer = getRelayer();
  if (!relayer) {
    res.status(503).json({ error: "Relayer not configured" });
    return;
  }
  res.json({ address: relayer.address.toBase58() });
});

/**
 * GET /api/relayer/status
 * Get relayer status (balance, address, readiness, fee info)
 */
app.get("/api/relayer/status", async (req: Request, res: Response): Promise<void> => {
  const relayer = getRelayer();
  if (!relayer) {
    res.status(503).json({
      error: "Relayer not configured",
      ready: false,
    });
    return;
  }

  try {
    const status = await relayer.getStatus();
    res.json({
      ...status,
      creationFee: CREATION_FEE,
      minDeposit: MIN_DEPOSIT,
    });
  } catch (error) {
    console.error("[relayer] Error getting status:", error);
    res.status(500).json({
      error: "Failed to get relayer status",
      details: sanitizeErrorForClient(error),
    });
  }
});

/**
 * POST /api/relayer/create-private
 * Create a private agent via relayer (user's wallet never signs)
 *
 * Body:
 *   ownerCommitment: number[] - 32-byte commitment from poseidon(agentSecret)
 *   maxPerTx: number - Max lamports per transaction (0 = unlimited)
 *   dailyLimit: number - Max lamports per day (0 = unlimited)
 *   totalLimit: number - Max lifetime lamports (0 = unlimited)
 *   expiresAt: number - Unix timestamp (0 = never)
 *   clientPublicKey: number[] - 32-byte X25519 public key for encryption
 *   depositSignature: string - Privacy Cash tx signature to relayer
 *   depositAmount: number - Total lamports sent (must be >= MIN_DEPOSIT)
 *
 * Returns:
 *   encryptedAgentKey: string - Base58 encoded encrypted agent key
 *   nonce: string - Base58 encoded nonce for decryption
 *   agentStatePda: string - CloakedAgentState PDA address
 *   vaultPda: string - Vault PDA address
 *   delegate: string - Delegate public key
 *   signature: string - Transaction signature
 */
app.post("/api/relayer/create-private", async (req: Request, res: Response): Promise<void> => {
  const relayer = getRelayer();
  if (!relayer) {
    res.status(503).json({ error: "Relayer not configured" });
    return;
  }

  const {
    ownerCommitment,
    maxPerTx,
    dailyLimit,
    totalLimit,
    expiresAt,
    clientPublicKey,
    depositSignature,
    depositAmount,
  } = req.body;

  // Validate required fields
  if (!ownerCommitment || !Array.isArray(ownerCommitment) || ownerCommitment.length !== 32) {
    res.status(400).json({ error: "Missing or invalid ownerCommitment (must be 32-byte array)" });
    return;
  }
  if (!clientPublicKey || !Array.isArray(clientPublicKey) || clientPublicKey.length !== 32) {
    res.status(400).json({ error: "Missing or invalid clientPublicKey (must be 32-byte X25519 key)" });
    return;
  }
  if (!depositSignature || typeof depositSignature !== "string") {
    res.status(400).json({ error: "Missing or invalid depositSignature (Privacy Cash tx signature required)" });
    return;
  }
  if (typeof depositAmount !== "number" || depositAmount < MIN_DEPOSIT) {
    res.status(400).json({ error: `Missing or invalid depositAmount (minimum ${MIN_DEPOSIT} lamports)` });
    return;
  }

  // Get client IP for rate limiting
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  try {
    const params: CreatePrivateAgentParams = {
      ownerCommitment,
      maxPerTx: maxPerTx ?? 0,
      dailyLimit: dailyLimit ?? 0,
      totalLimit: totalLimit ?? 0,
      expiresAt: expiresAt ?? 0,
      clientPublicKey,
      depositSignature,
      depositAmount,
    };

    const result = await relayer.createPrivateAgent(params, clientIp);
    res.json(result);
  } catch (error) {
    console.error("[relayer] Error creating private agent:", error);

    // Check for rate limit error
    if (error instanceof Error && error.message.includes("Rate limit")) {
      res.status(429).json({
        error: error.message,
      });
      return;
    }

    // Check for deposit validation error
    if (error instanceof Error && (error.message.includes("deposit") || error.message.includes("Minimum"))) {
      res.status(400).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Failed to create private agent",
      details: sanitizeErrorForClient(error),
    });
  }
});

/**
 * POST /api/relayer/freeze-private
 * Freeze a private agent via relayer
 */
app.post("/api/relayer/freeze-private", async (req: Request, res: Response): Promise<void> => {
  const validated = validatePrivateOp(req, res);
  if (!validated) return;

  const { relayer, agentStatePda, proofBytes, witnessBytes, clientIp } = validated;

  try {
    const params: PrivateOperationParams = { agentStatePda, proofBytes, witnessBytes };
    const signature = await relayer.freezePrivate(params, clientIp);
    res.json({ signature });
  } catch (error) {
    handlePrivateOpError(res, error, "freeze private agent");
  }
});

/**
 * POST /api/relayer/unfreeze-private
 * Unfreeze a private agent via relayer
 */
app.post("/api/relayer/unfreeze-private", async (req: Request, res: Response): Promise<void> => {
  const validated = validatePrivateOp(req, res);
  if (!validated) return;

  const { relayer, agentStatePda, proofBytes, witnessBytes, clientIp } = validated;

  try {
    const params: PrivateOperationParams = { agentStatePda, proofBytes, witnessBytes };
    const signature = await relayer.unfreezePrivate(params, clientIp);
    res.json({ signature });
  } catch (error) {
    handlePrivateOpError(res, error, "unfreeze private agent");
  }
});

/**
 * POST /api/relayer/update-constraints-private
 * Update constraints for a private agent via relayer
 */
app.post("/api/relayer/update-constraints-private", async (req: Request, res: Response): Promise<void> => {
  const validated = validatePrivateOp(req, res);
  if (!validated) return;

  const { relayer, agentStatePda, proofBytes, witnessBytes, clientIp } = validated;
  const { maxPerTx, dailyLimit, totalLimit, expiresAt } = req.body;

  try {
    const params: UpdateConstraintsPrivateParams = {
      agentStatePda,
      proofBytes,
      witnessBytes,
      maxPerTx: maxPerTx ?? null,
      dailyLimit: dailyLimit ?? null,
      totalLimit: totalLimit ?? null,
      expiresAt: expiresAt ?? null,
    };
    const signature = await relayer.updateConstraintsPrivate(params, clientIp);
    res.json({ signature });
  } catch (error) {
    handlePrivateOpError(res, error, "update constraints");
  }
});

/**
 * POST /api/relayer/withdraw-private
 * Withdraw from a private agent via relayer
 */
app.post("/api/relayer/withdraw-private", async (req: Request, res: Response): Promise<void> => {
  const validated = validatePrivateOp(req, res);
  if (!validated) return;

  const { relayer, agentStatePda, proofBytes, witnessBytes, clientIp } = validated;
  const { amount, destination } = req.body;

  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "Missing or invalid amount" });
    return;
  }
  if (!destination || typeof destination !== "string") {
    res.status(400).json({ error: "Missing or invalid destination" });
    return;
  }

  try {
    const params: WithdrawPrivateParams = {
      agentStatePda,
      proofBytes,
      witnessBytes,
      amount,
      destination,
    };
    const signature = await relayer.withdrawPrivate(params, clientIp);
    res.json({ signature });
  } catch (error) {
    handlePrivateOpError(res, error, "withdraw");
  }
});

/**
 * POST /api/relayer/close-private
 * Close a private agent via relayer
 */
app.post("/api/relayer/close-private", async (req: Request, res: Response): Promise<void> => {
  const validated = validatePrivateOp(req, res);
  if (!validated) return;

  const { relayer, agentStatePda, proofBytes, witnessBytes, clientIp } = validated;
  const { destination } = req.body;

  if (!destination || typeof destination !== "string") {
    res.status(400).json({ error: "Missing or invalid destination" });
    return;
  }

  try {
    const params: ClosePrivateParams = {
      agentStatePda,
      proofBytes,
      witnessBytes,
      destination,
    };
    const signature = await relayer.closePrivate(params, clientIp);
    res.json({ signature });
  } catch (error) {
    handlePrivateOpError(res, error, "close agent");
  }
});

/**
 * POST /api/relayer/cosign-spend
 * Co-sign a spend transaction (relayer is fee payer)
 *
 * The SDK builds a spend transaction with delegate signing and relayer as fee_payer.
 * The delegate signs first, serializes, and sends here. Relayer co-signs and submits.
 *
 * Body:
 *   transaction: string - Base64 encoded partially-signed transaction
 *
 * Returns:
 *   signature: string - Transaction signature
 */
app.post("/api/relayer/cosign-spend", async (req: Request, res: Response): Promise<void> => {
  const relayer = getRelayer();
  if (!relayer) {
    res.status(503).json({ error: "Relayer not configured" });
    return;
  }

  const { transaction } = req.body;

  if (!transaction || typeof transaction !== "string") {
    res.status(400).json({ error: "Missing or invalid transaction (base64 encoded)" });
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  try {
    const params: SpendCosignParams = { transaction };
    const signature = await relayer.cosignSpend(params, clientIp);
    res.json({ signature });
  } catch (error) {
    console.error("[relayer] Error co-signing spend:", error);

    // Check for rate limit errors
    if (error instanceof Error && error.message.includes("Rate limit")) {
      res.status(429).json({ error: error.message });
      return;
    }

    // Check for fee payer validation errors
    if (error instanceof Error && error.message.includes("Fee payer")) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Try to parse Cloaked program errors for user-friendly messages
    const programError = parseCloakedError(error);
    if (programError) {
      res.status(400).json({
        error: programError.message,
        code: programError.code,
      });
      return;
    }

    res.status(500).json({
      error: "Failed to co-sign spend",
      details: sanitizeErrorForClient(error),
    });
  }
});

// ============================================
// x402 Test Server (for integration testing)
// ============================================

// x402 test recipient - uses relayer address if available, otherwise generates ephemeral
const x402Recipient = RELAYER_PRIVATE_KEY
  ? getRelayer()?.address.toBase58() || "11111111111111111111111111111111"
  : "11111111111111111111111111111111";

const x402Connection = new Connection(RPC_URL, "confirmed");
app.use("/api/x402-test", createX402TestRoutes(x402Connection, x402Recipient));

// ============================================
// Error handling
// ============================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============================================
// Start server with WebSocket support
// ============================================

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

function getHeliusWsUrl(): string {
  return RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
}

server.on("upgrade", (request, socket, head) => {
  const pathname = request.url?.split("?")[0];

  if (pathname === "/api/rpc") {
    const clientIp = request.socket.remoteAddress || "unknown";
    const rateLimit = checkRpcRateLimit(clientIp);

    if (!rateLimit.allowed) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      const heliusWs = new WebSocket(getHeliusWsUrl());

      let isAlive = true;
      let heliusReady = false;
      const messageQueue: Buffer[] = [];

      const pingInterval = setInterval(() => {
        if (!isAlive) {
          clearInterval(pingInterval);
          clientWs.terminate();
          return;
        }
        isAlive = false;
        clientWs.ping();
      }, 30000);

      clientWs.on("pong", () => {
        isAlive = true;
      });

      // Listen for client messages immediately, buffer if Helius not ready
      clientWs.on("message", (data) => {
        const msg = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (heliusReady && heliusWs.readyState === WebSocket.OPEN) {
          heliusWs.send(msg.toString());
        } else {
          messageQueue.push(msg);
        }
      });

      heliusWs.on("open", () => {
        heliusReady = true;
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()!;
          heliusWs.send(msg.toString());
        }
      });

      heliusWs.on("message", (data) => {
        const msg = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(msg.toString());
        }
      });

      heliusWs.on("error", (err) => {
        console.error("[ws-proxy] Helius error:", err.message);
        clientWs.close(1011, "Upstream connection error");
      });

      heliusWs.on("close", () => {
        clearInterval(pingInterval);
        clientWs.close(1000, "Upstream closed");
      });

      clientWs.on("close", () => {
        clearInterval(pingInterval);
        heliusWs.close();
      });

      clientWs.on("error", (err) => {
        console.error("[ws-proxy] Client connection error:", err.message);
        clearInterval(pingInterval);
        heliusWs.close();
      });
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[server] Backend running on port ${PORT}`);
});

export default app;
