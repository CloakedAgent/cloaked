// sdk/src/mcp/tools.ts

import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CloakedAgent } from "../agent";
import {
  BalanceResponse,
  StatusResponse,
  PayResponse,
  X402FetchResponse,
  X402PaymentRequirements,
} from "./types";

/**
 * Sanitize error messages to prevent key leakage
 * Redacts base58-encoded strings that could be keys (32+ chars)
 */
function sanitizeErrorMessage(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    // Don't use JSON.stringify on unknown objects - could leak keys
    return "An error occurred";
  }

  // Redact potential base58 keys (32+ alphanumeric chars in base58 charset)
  return message.replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, "[REDACTED]");
}

/**
 * Tool handler for cloak_balance
 * Returns enhanced balance info with constraints
 */
export async function handleBalance(agentKey?: string): Promise<BalanceResponse> {
  const key = agentKey || process.env.CLOAKED_AGENT_KEY;
  if (!key) {
    throw new Error("No Agent Key provided and CLOAKED_AGENT_KEY not set");
  }

  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const agent = new CloakedAgent(key, rpcUrl);
    const state = await agent.getState();

    // Calculate expires_in_days
    let expiresInDays: number | null = null;
    if (state.constraints.expiresAt) {
      const now = Date.now();
      const expiresAt = state.constraints.expiresAt.getTime();
      expiresInDays = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));
    }

    return {
      balance_sol: state.balance / LAMPORTS_PER_SOL,
      balance_lamports: state.balance,
      daily_spent: state.spending.dailySpent,
      daily_limit: state.constraints.dailyLimit,
      daily_remaining: state.spending.dailyRemaining === Number.MAX_SAFE_INTEGER ? -1 : state.spending.dailyRemaining,
      total_spent: state.spending.totalSpent,
      total_limit: state.constraints.totalLimit,
      total_remaining: state.spending.totalRemaining === Number.MAX_SAFE_INTEGER ? -1 : state.spending.totalRemaining,
      expires_in_days: expiresInDays,
      frozen: state.constraints.frozen,
      status: state.status,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to get balance: ${sanitizeErrorMessage(error)}`);
  }
}

/**
 * Tool handler for cloak_status
 * Returns detailed agent status with health indicator
 */
export async function handleStatus(agentKey?: string): Promise<StatusResponse> {
  const key = agentKey || process.env.CLOAKED_AGENT_KEY;
  if (!key) {
    throw new Error("No Agent Key provided and CLOAKED_AGENT_KEY not set");
  }

  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const agent = new CloakedAgent(key, rpcUrl);
    const state = await agent.getState();

    // Determine health status
    let health: string = "ok";
    if (state.status === "frozen") {
      health = "frozen";
    } else if (state.status === "expired") {
      health = "expired";
    } else if (state.balance < 0.01 * LAMPORTS_PER_SOL) {
      health = "low_balance";
    } else if (state.constraints.dailyLimit > 0 && state.spending.dailyRemaining < state.constraints.dailyLimit * 0.1) {
      health = "near_daily_limit";
    } else if (state.constraints.totalLimit > 0 && state.spending.totalRemaining < state.constraints.totalLimit * 0.1) {
      health = "near_total_limit";
    }

    return {
      constraints: {
        max_per_tx: state.constraints.maxPerTx === 0 ? "unlimited" : state.constraints.maxPerTx,
        daily_limit: state.constraints.dailyLimit === 0 ? "unlimited" : state.constraints.dailyLimit,
        total_limit: state.constraints.totalLimit === 0 ? "unlimited" : state.constraints.totalLimit,
        expires_at: state.constraints.expiresAt ? state.constraints.expiresAt.toISOString() : "never",
      },
      spending: {
        balance_sol: state.balance / LAMPORTS_PER_SOL,
        daily_spent: state.spending.dailySpent,
        total_spent: state.spending.totalSpent,
      },
      health,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to get status: ${sanitizeErrorMessage(error)}`);
  }
}

/**
 * Tool handler for cloak_pay
 * Pays to a destination address for x402 services
 */
export async function handlePay(
  destination: string,
  amountSol: number,
  agentKey?: string
): Promise<PayResponse> {
  const key = agentKey || process.env.CLOAKED_AGENT_KEY;
  if (!key) {
    throw new Error("No Agent Key provided and CLOAKED_AGENT_KEY not set");
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const agent = new CloakedAgent(key, rpcUrl);

  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  try {
    const result = await agent.spend({
      destination: new PublicKey(destination),
      amount: amountLamports,
    });

    return {
      success: true,
      signature: result.signature,
      remaining_balance: result.remainingBalance / LAMPORTS_PER_SOL,
      daily_remaining: result.dailyRemaining === Number.MAX_SAFE_INTEGER ? -1 : result.dailyRemaining / LAMPORTS_PER_SOL,
    };
  } catch (error: unknown) {
    return {
      success: false,
      signature: "",
      remaining_balance: 0,
      daily_remaining: 0,
      error: sanitizeErrorMessage(error),
    };
  }
}

/**
 * Decode X-PAYMENT-REQUIRED header (base64 JSON)
 */
function decodePaymentRequired(encoded: string): X402PaymentRequirements {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

/**
 * Encode payment payload for X-PAYMENT header
 */
function encodePaymentPayload(signature: string): string {
  return Buffer.from(JSON.stringify({ signature })).toString('base64');
}

/**
 * Parse response content based on content-type
 */
async function parseResponseContent(response: Response): Promise<{
  type: "json" | "text" | "binary";
  content: unknown;
  contentType: string;
}> {
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  if (contentType.includes("application/json")) {
    return { type: "json", content: await response.json(), contentType };
  } else if (contentType.includes("text/")) {
    return { type: "text", content: await response.text(), contentType };
  } else {
    // Binary - base64 encode
    const buffer = await response.arrayBuffer();
    return {
      type: "binary",
      content: Buffer.from(buffer).toString('base64'),
      contentType
    };
  }
}

/**
 * Tool handler for cloak_x402_fetch
 * Fetches x402-protected resources, automatically handling payment
 */
export async function handleX402Fetch(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  agentKey?: string
): Promise<X402FetchResponse> {
  const key = agentKey || process.env.CLOAKED_AGENT_KEY;
  if (!key) {
    return {
      success: false,
      error: "No Agent Key provided and CLOAKED_AGENT_KEY not set",
      statusCode: 0,
    };
  }

  const method = options?.method || "GET";
  const customHeaders = options?.headers || {};

  try {
    // Step 1: Initial fetch
    const initialResponse = await fetch(url, {
      method,
      headers: customHeaders,
      body: options?.body,
    });

    // If not 402, return content directly
    if (initialResponse.status !== 402) {
      if (!initialResponse.ok) {
        return {
          success: false,
          error: `HTTP ${initialResponse.status}: ${initialResponse.statusText}`,
          statusCode: initialResponse.status,
        };
      }

      const parsed = await parseResponseContent(initialResponse);
      return {
        success: true,
        ...parsed,
        statusCode: initialResponse.status,
      };
    }

    // Step 2: Parse payment requirements from X-PAYMENT-REQUIRED header
    const paymentRequiredHeader = initialResponse.headers.get("X-PAYMENT-REQUIRED");
    if (!paymentRequiredHeader) {
      return {
        success: false,
        error: "Received 402 but no X-PAYMENT-REQUIRED header found",
        statusCode: 402,
      };
    }

    let requirements: X402PaymentRequirements;
    try {
      requirements = decodePaymentRequired(paymentRequiredHeader);
    } catch {
      return {
        success: false,
        error: "Failed to decode X-PAYMENT-REQUIRED header",
        statusCode: 402,
      };
    }

    // Validate required fields
    if (!requirements.payTo || typeof requirements.payTo !== 'string') {
      return {
        success: false,
        error: "Invalid payment requirements: missing payTo address",
        statusCode: 402,
      };
    }
    if (!requirements.amount || typeof requirements.amount !== 'string') {
      return {
        success: false,
        error: "Invalid payment requirements: missing amount",
        statusCode: 402,
      };
    }

    // Step 3: Make payment
    const amountLamports = parseInt(requirements.amount, 10);
    if (isNaN(amountLamports) || amountLamports <= 0) {
      return {
        success: false,
        error: "Invalid payment amount in X-PAYMENT-REQUIRED header",
        statusCode: 402,
      };
    }
    const amountSol = amountLamports / LAMPORTS_PER_SOL;

    const payResult = await handlePay(requirements.payTo, amountSol, key);

    if (!payResult.success) {
      return {
        success: false,
        error: `Payment failed: ${payResult.error}`,
        statusCode: 402,
      };
    }

    // Step 4: Retry with payment proof
    const paymentPayload = encodePaymentPayload(payResult.signature);

    const retryResponse = await fetch(url, {
      method,
      headers: {
        ...customHeaders,
        "X-PAYMENT": paymentPayload,
      },
      body: options?.body,
    });

    if (!retryResponse.ok) {
      return {
        success: false,
        error: `Payment accepted but resource fetch failed: HTTP ${retryResponse.status}`,
        statusCode: retryResponse.status,
        payment: {
          signature: payResult.signature,
          amount_sol: amountSol,
          amount_lamports: amountLamports,
          recipient: requirements.payTo,
        },
      };
    }

    // Step 5: Return content with payment info
    const parsed = await parseResponseContent(retryResponse);
    return {
      success: true,
      ...parsed,
      statusCode: retryResponse.status,
      payment: {
        signature: payResult.signature,
        amount_sol: amountSol,
        amount_lamports: amountLamports,
        recipient: requirements.payTo,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(error),
      statusCode: 0,
    };
  }
}

