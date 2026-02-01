#!/usr/bin/env node
// sdk/src/mcp/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleBalance,
  handleStatus,
  handlePay,
  handleX402Fetch,
} from "./tools";

// ============================================
// Tool definitions
// ============================================

const TOOLS = [
  {
    name: "cloak_balance",
    description: "Get Cloaked Agent balance with spending limits and remaining amounts. Use this to check how much SOL is available and what the daily/total limits are.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_key: {
          type: "string",
          description: "Cloaked Agent key (optional, uses env CLOAKED_AGENT_KEY if not provided)",
        },
      },
      required: [],
    },
  },
  {
    name: "cloak_status",
    description: "Get detailed Cloaked Agent status including constraints, spending history, and health indicator. Use this for a comprehensive overview of the agent's spending account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_key: {
          type: "string",
          description: "Cloaked Agent key (optional, uses env CLOAKED_AGENT_KEY if not provided)",
        },
      },
      required: [],
    },
  },
  {
    name: "cloak_pay",
    description: "Pay SOL to a destination address using the Cloaked Agent spending account. Use this for x402 payments or any SOL transfer within the agent's spending limits.",
    inputSchema: {
      type: "object" as const,
      properties: {
        destination: {
          type: "string",
          description: "Destination wallet address (base58 encoded Solana public key)",
        },
        amount: {
          type: "number",
          minimum: 0.000001,
          description: "Amount in SOL to pay (e.g., 0.001 for 1 milliSOL, 0.1 for 100 milliSOL)",
        },
        agent_key: {
          type: "string",
          description: "Cloaked Agent key (optional, uses env CLOAKED_AGENT_KEY if not provided)",
        },
      },
      required: ["destination", "amount"],
    },
  },
  {
    name: "cloak_x402_fetch",
    description: "Fetch x402-protected resources with automatic payment. Makes HTTP request, detects 402 Payment Required, pays using Cloaked Agent, retries with payment proof, returns content. Test server available at https://api.cloakedagent.com/api/x402-test/paid-content (0.001 SOL).",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch (must be a valid HTTP/HTTPS URL)",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "HTTP method (default: GET)",
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Custom request headers (e.g., { \"Accept\": \"application/json\" })",
        },
        body: {
          type: "string",
          description: "Request body for POST/PUT requests",
        },
        agent_key: {
          type: "string",
          description: "Cloaked Agent key (optional, uses env CLOAKED_AGENT_KEY if not provided)",
        },
      },
      required: ["url"],
    },
  },
];

// ============================================
// Prompt definitions
// ============================================

const PROMPTS = [
  {
    name: "check_balance",
    description: "Check the current balance and spending limits of your Cloaked Agent",
    arguments: [],
  },
  {
    name: "spending_report",
    description: "Get a detailed spending report including health status and remaining limits",
    arguments: [],
  },
  {
    name: "pay_for_service",
    description: "Pay for an x402 service or transfer SOL to a destination",
    arguments: [
      {
        name: "destination",
        description: "The Solana wallet address to pay",
        required: true,
      },
      {
        name: "amount",
        description: "Amount in SOL (e.g., 0.01)",
        required: true,
      },
      {
        name: "service_name",
        description: "Name of the service being paid for (for your records)",
        required: false,
      },
    ],
  },
  {
    name: "can_i_afford",
    description: "Check if a specific payment amount is within your current limits",
    arguments: [
      {
        name: "amount",
        description: "Amount in SOL you want to check",
        required: true,
      },
    ],
  },
  {
    name: "fetch_paid_content",
    description: "Fetch content from an x402-protected URL with automatic payment. Test with https://api.cloakedagent.com/api/x402-test/paid-content (0.001 SOL)",
    arguments: [
      {
        name: "url",
        description: "The x402-protected URL to fetch (test: https://api.cloakedagent.com/api/x402-test/paid-content)",
        required: true,
      },
      {
        name: "description",
        description: "What this content is (for your records)",
        required: false,
      },
    ],
  },
];

// ============================================
// Prompt content generators
// ============================================

function getPromptContent(name: string, args: Record<string, string>): string {
  switch (name) {
    case "check_balance":
      return `Please check my Cloaked Agent's current balance and spending limits.

Use the cloak_balance tool to get the current state, then tell me:
1. Current balance in SOL
2. How much I've spent today vs my daily limit
3. How much I've spent total vs my lifetime limit
4. Whether I'm frozen or have any restrictions`;

    case "spending_report":
      return `Please give me a comprehensive spending report for my Cloaked Agent.

Use the cloak_status tool to get detailed information, then provide:
1. Current health status (ok, low_balance, near_limit, frozen, etc.)
2. All constraint settings (max per transaction, daily limit, total limit, expiration)
3. Current spending statistics
4. Any warnings or recommendations based on the current state`;

    case "pay_for_service":
      const dest = args.destination || "[DESTINATION_ADDRESS]";
      const amt = args.amount || "[AMOUNT]";
      const svc = args.service_name ? ` for ${args.service_name}` : "";
      return `Please pay ${amt} SOL to ${dest}${svc}.

Steps:
1. First use cloak_balance to verify I have sufficient funds and am within limits
2. If the balance and limits allow, use cloak_pay with:
   - destination: ${dest}
   - amount: ${amt}
3. Report the transaction result including the signature and remaining balance`;

    case "can_i_afford":
      const checkAmt = args.amount || "[AMOUNT]";
      return `Please check if I can afford to spend ${checkAmt} SOL with my Cloaked Agent.

Use cloak_balance to check:
1. Is my current balance >= ${checkAmt} SOL?
2. Would this exceed my per-transaction limit?
3. Would this exceed my remaining daily limit?
4. Would this exceed my remaining total limit?
5. Am I frozen or expired?

Give me a clear yes/no answer with explanation.`;

    case "fetch_paid_content":
      const fetchUrl = args.url || "[URL]";
      const desc = args.description ? ` (${args.description})` : "";
      return `Please fetch the x402-protected content from ${fetchUrl}${desc}.

Steps:
1. First use cloak_balance to verify you have sufficient funds
2. Use cloak_x402_fetch with url: ${fetchUrl}
3. The tool will automatically:
   - Detect if payment is required (402 response)
   - Parse the payment requirements
   - Pay the required amount
   - Retry and fetch the content
4. Report what content was received and what was paid`;

    default:
      return `Unknown prompt: ${name}`;
  }
}

// ============================================
// Server factory
// ============================================

function createServer(): Server {
  const server = new Server(
    {
      name: "cloaked-mcp",
      version: "0.8.1",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handler for listing available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPTS };
  });

  // Handler for getting a specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const prompt = PROMPTS.find(p => p.name === name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    const content = getPromptContent(name, args || {});

    return {
      description: prompt.description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: content,
          },
        },
      ],
    };
  });

  // Handler for tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "cloak_balance": {
          const balanceArgs = args as { agent_key?: string };
          result = await handleBalance(balanceArgs?.agent_key);
          break;
        }

        case "cloak_status": {
          const statusArgs = args as { agent_key?: string };
          result = await handleStatus(statusArgs?.agent_key);
          break;
        }

        case "cloak_pay": {
          const payArgs = args as { destination: string; amount: number; agent_key?: string };
          if (!payArgs.destination || payArgs.amount === undefined) {
            throw new Error("destination and amount are required");
          }
          // Ensure amount is treated as a float
          const amount = typeof payArgs.amount === 'string'
            ? parseFloat(payArgs.amount)
            : payArgs.amount;
          if (isNaN(amount) || amount <= 0) {
            throw new Error("amount must be a positive number (e.g., 0.001 for 1 milliSOL)");
          }
          result = await handlePay(payArgs.destination, amount, payArgs.agent_key);
          break;
        }

        case "cloak_x402_fetch": {
          const fetchArgs = args as {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
            agent_key?: string;
          };
          if (!fetchArgs.url) {
            throw new Error("url is required");
          }
          result = await handleX402Fetch(
            fetchArgs.url,
            {
              method: fetchArgs.method,
              headers: fetchArgs.headers,
              body: fetchArgs.body,
            },
            fetchArgs.agent_key
          );
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ============================================
// Run MCP Server
// ============================================

/**
 * Run the MCP server - exported for programmatic use
 * Validates CLOAKED_AGENT_KEY and starts the server
 */
export async function runMcpServer(): Promise<void> {
  // Validate required environment variable
  const agentKey = process.env.CLOAKED_AGENT_KEY;
  if (!agentKey) {
    throw new Error("CLOAKED_AGENT_KEY environment variable is required");
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cloaked MCP server started");
}

// Auto-run when executed directly (via SDK's bin entry)
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule) {
  if (!process.env.CLOAKED_AGENT_KEY) {
    console.error("Error: CLOAKED_AGENT_KEY environment variable is required");
    console.error("");
    console.error("Usage:");
    console.error("  CLOAKED_AGENT_KEY=<your-agent-key> npx cloaked-mcp");
    console.error("");
    console.error("Environment variables:");
    console.error("  CLOAKED_AGENT_KEY    (required) Base58 encoded Cloaked Agent private key");
    console.error("  CLOAKED_BACKEND_URL  (optional) Backend URL, default: http://localhost:3645");
    console.error("  SOLANA_RPC_URL       (optional) Solana RPC URL, default: https://api.devnet.solana.com");
    process.exit(1);
  }

  runMcpServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
