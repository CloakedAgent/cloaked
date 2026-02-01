/**
 * x402 Test Server Routes
 *
 * Mock x402 endpoints for developers to test their Cloak + x402 integration.
 *
 * How it works:
 * 1. Client requests /api/x402-test/paid-content
 * 2. Server returns 402 with X-PAYMENT-REQUIRED header containing base64-encoded payment requirements
 * 3. Client makes payment using Cloak agent
 * 4. Client retries request with X-PAYMENT header (base64-encoded payload with signature)
 * 5. Server verifies payment on-chain
 * 6. Server returns protected content if valid
 *
 * This is a minimal x402 implementation for testing - production implementations
 * should use a proper x402 library like @x402/server.
 */

import { Router, Request, Response } from "express";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { verifyPayment, buildPaymentRequirements, encodePaymentRequired, decodePaymentPayload, PaymentRequirements } from "./verify";

// Test content price: 0.001 SOL (1,000,000 lamports)
const CONTENT_PRICE_LAMPORTS = 1_000_000;

// Payment validity window: 5 minutes
const PAYMENT_VALIDITY_MS = 5 * 60 * 1000;

// Track verified payments to prevent replay
const verifiedPayments = new Map<string, { timestamp: number; resourceId: string }>();

export function createX402TestRoutes(connection: Connection, recipientAddress: string): Router {
  const router = Router();

  /**
   * GET /api/x402-test/info
   * Get info about the x402 test server
   */
  router.get("/info", (req: Request, res: Response) => {
    res.json({
      description: "x402 Test Server for Cloak integration testing",
      recipientAddress,
      contentPrice: {
        lamports: CONTENT_PRICE_LAMPORTS,
        sol: CONTENT_PRICE_LAMPORTS / LAMPORTS_PER_SOL,
      },
      endpoints: {
        "/api/x402-test/info": "This endpoint",
        "/api/x402-test/paid-content": "Protected content (returns 402, requires payment)",
        "/api/x402-test/paid-content/:id": "Protected content by ID",
      },
      usage: {
        step1: "Request /api/x402-test/paid-content",
        step2: "Receive 402 with X-PAYMENT-REQUIRED header (base64-encoded requirements)",
        step3: "Make payment to recipientAddress using Cloak agent",
        step4: "Retry request with X-PAYMENT header (base64-encoded payload with signature)",
        step5: "Receive protected content",
      },
    });
  });

  /**
   * GET /api/x402-test/paid-content
   * GET /api/x402-test/paid-content/:id
   *
   * Protected content endpoint - returns 402 if no valid payment
   */
  router.get("/paid-content/:id?", async (req: Request, res: Response): Promise<void> => {
    const resourceId = req.params.id || "default";

    // Accept both X-PAYMENT (official) and PAYMENT-SIGNATURE (legacy)
    const xPaymentHeader = req.header("X-PAYMENT");
    const legacyHeader = req.header("PAYMENT-SIGNATURE") || req.header("X-Payment-Signature");

    let paymentSignature: string | undefined;

    if (xPaymentHeader) {
      // Decode base64 payload
      try {
        const payload = decodePaymentPayload(xPaymentHeader);
        paymentSignature = payload.signature;
      } catch {
        res.status(400).json({ error: "Invalid X-PAYMENT header format" });
        return;
      }
    } else if (legacyHeader) {
      paymentSignature = legacyHeader;
    }

    // Build payment requirements for this resource
    const requirements = buildPaymentRequirements(recipientAddress, CONTENT_PRICE_LAMPORTS);

    // If no payment signature, return 402
    if (!paymentSignature) {
      const encodedRequirements = encodePaymentRequired(requirements);

      res.status(402);
      res.setHeader("X-PAYMENT-REQUIRED", encodedRequirements);
      res.json({
        error: "Payment Required",
        message: "This content requires payment. Include X-PAYMENT header with base64-encoded payment payload.",
        requirements,
        example: {
          header: "X-PAYMENT: <base64-encoded-payment-payload>",
          payloadFormat: { signature: "<solana-tx-signature>" },
          amount: `${CONTENT_PRICE_LAMPORTS} lamports (${CONTENT_PRICE_LAMPORTS / LAMPORTS_PER_SOL} SOL)`,
          payTo: recipientAddress,
        },
      });
      return;
    }

    // Check if payment was already verified (replay protection)
    const existingPayment = verifiedPayments.get(paymentSignature);
    if (existingPayment) {
      // Allow reuse for same resource within validity window
      if (existingPayment.resourceId === resourceId &&
          Date.now() - existingPayment.timestamp < PAYMENT_VALIDITY_MS) {
        res.json(getProtectedContent(resourceId));
        return;
      }
      // Different resource or expired
      res.status(403).json({
        error: "Payment already used",
        message: "This payment signature was already used for a different resource or has expired",
      });
      return;
    }

    // Verify payment on-chain
    const verification = await verifyPayment(connection, paymentSignature, requirements);

    if (!verification.valid) {
      const encodedRequirements = encodePaymentRequired(requirements);
      res.status(402);
      res.setHeader("X-PAYMENT-REQUIRED", encodedRequirements);
      res.json({
        error: "Invalid Payment",
        message: verification.error,
        requirements,
      });
      return;
    }

    // Store verified payment for replay protection
    verifiedPayments.set(paymentSignature, {
      timestamp: Date.now(),
      resourceId,
    });

    // Clean up old verified payments periodically
    cleanupOldPayments();

    // Return protected content
    res.json(getProtectedContent(resourceId, paymentSignature));
  });

  return router;
}

/**
 * Get protected content for a resource
 */
function getProtectedContent(resourceId: string, paymentSignature?: string) {
  const content: Record<string, unknown> = {
    premium: {
      id: resourceId,
      title: "Premium AI Research Data",
      data: {
        insights: [
          "Market trend analysis shows 23% growth in AI adoption",
          "Key competitors are focusing on edge computing",
          "Customer sentiment positive for autonomous agents",
        ],
        recommendations: [
          "Increase investment in privacy-preserving AI",
          "Focus on enterprise integrations",
          "Build developer community",
        ],
        confidenceScore: 0.87,
      },
      generatedAt: new Date().toISOString(),
    },
    weather: {
      id: resourceId,
      title: "Premium Weather Data",
      data: {
        forecast: "Sunny with a chance of blockchain",
        temperature: "72 SOL degrees",
        humidity: "low volatility",
      },
    },
    default: {
      id: resourceId,
      title: "Protected Content",
      message: "You have successfully accessed protected content!",
      timestamp: new Date().toISOString(),
      paidWith: paymentSignature ? paymentSignature.slice(0, 16) + "..." : undefined,
    },
  };

  return content[resourceId] || content.default;
}

/**
 * Remove payments older than validity window
 */
function cleanupOldPayments() {
  const now = Date.now();
  for (const [sig, data] of verifiedPayments) {
    if (now - data.timestamp > PAYMENT_VALIDITY_MS * 2) {
      verifiedPayments.delete(sig);
    }
  }
}
