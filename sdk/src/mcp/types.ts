// sdk/src/mcp/types.ts

/**
 * Response types for MCP tools
 */

// Enhanced balance response with constraints
export interface BalanceResponse {
  balance_sol: number;
  balance_lamports: number;
  daily_spent: number;
  daily_limit: number;
  daily_remaining: number;
  total_spent: number;
  total_limit: number;
  total_remaining: number;
  expires_in_days: number | null;
  frozen: boolean;
  status: string;
}

// Status response with health indicator
export interface StatusResponse {
  constraints: {
    max_per_tx: number | string;
    daily_limit: number | string;
    total_limit: number | string;
    expires_at: string;
  };
  spending: {
    balance_sol: number;
    daily_spent: number;
    total_spent: number;
  };
  health: string;
}

// Pay response
export interface PayResponse {
  success: boolean;
  signature: string;
  remaining_balance: number;
  daily_remaining: number;
  error?: string;
}

export interface ErrorResponse {
  error: string;
}

// x402 fetch response
export interface X402FetchResponse {
  success: boolean;
  // Content info (on success)
  type?: "json" | "text" | "binary";
  content?: unknown;
  contentType?: string;
  // Payment info (if payment was made)
  payment?: {
    signature: string;
    amount_sol: number;
    amount_lamports: number;
    recipient: string;
  };
  // Error info (on failure)
  error?: string;
  // Original status code
  statusCode: number;
}

// x402 payment requirements (from server)
export interface X402PaymentRequirements {
  payTo: string;
  amount: string;
  currency: string;
  network: string;
}
