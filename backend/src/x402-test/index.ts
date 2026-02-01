/**
 * x402 Test Server Module
 *
 * Mock x402 server for testing Cloak + x402 integrations.
 * NOT for production use - this is a simplified implementation.
 */

export { createX402TestRoutes } from "./routes";
export { verifyPayment, buildPaymentRequirements } from "./verify";
export type { PaymentRequirements, VerifyPaymentResult } from "./verify";
