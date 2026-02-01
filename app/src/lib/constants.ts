import { PublicKey } from "@solana/web3.js";

// Backend API (must be defined first - RPC_URL depends on it)
const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3645";

// Enforce HTTPS in production for non-localhost URLs
if (
  process.env.NODE_ENV === "production" &&
  rawBackendUrl.startsWith("http://") &&
  !rawBackendUrl.includes("localhost") &&
  !rawBackendUrl.includes("127.0.0.1")
) {
  throw new Error("HTTPS required for backend communication in production");
}

export const BACKEND_URL = rawBackendUrl;

// Network configuration
export const RPC_URL = `${BACKEND_URL}/api/rpc`;
export const NETWORK = "devnet" as const;

// Privacy Cash configuration
export const PRIVACY_CASH_KEY_BASE_PATH = "/circuit2";
export const PRIVACY_CASH_SIGN_MESSAGE = "Privacy Money account sign in";

// Privacy Cash demo configuration (devnet only)
// In demo mode, Privacy Cash is simulated (UI only) and vault funding is 0
// Users can fund manually via wallet or vault address to test spending
export const PRIVACY_CASH_DEMO = {
  // Demo notice message (full)
  MESSAGE: "Devnet Demo - Privacy Cash integration is simulated to preview how private funding will work on mainnet. Private agents are created with empty vaults. To test spending, fund manually via your wallet or the vault address.",
  // Short message for compact spaces
  MESSAGE_SHORT: "Devnet Demo - Privacy Cash simulated. Fund manually to test spending.",
  // Privacy Cash docs URL
  DOCS_URL: "/docs/privacy/privacy-cash",
  // Privacy Cash official site
  PRIVACY_CASH_URL: "https://privacycash.org",
  // Withdrawal fee (charged when funding agents from Privacy Cash)
  WITHDRAWAL_FEE: "0.35%",
};

// Cloaked program ID (from Anchor deploy)
export const CLOAKED_PROGRAM_ID = new PublicKey(
  "3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB"
);

// Fee configuration
export const WITHDRAWAL_FEE_BPS = 50; // 0.5% = 50 basis points
export const WITHDRAWAL_FEE_PERCENTAGE = 0.005; // 0.5%

// Account sizes (must match on-chain program)
export const CLOAKED_AGENT_STATE_SIZE = 171;
