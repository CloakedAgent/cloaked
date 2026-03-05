---
name: cloaked-agent
description: Give AI agents trustless, on-chain constrained spending power on Solana. SDK + MCP server for autonomous payments.
---

# Cloaked — Trustless Spending Accounts for AI Agents on Solana

Cloaked lets you give AI agents spending power without giving them your wallet keys. Agents get a constrained keypair that can only spend within limits enforced by a Solana on-chain program. Even a jailbroken or compromised agent cannot exceed its constraints — the blockchain rejects any transaction that violates them.

**Website:** https://cloakedagent.com
**Docs:** https://cloakedagent.com/docs
**SDK:** `@cloakedagent/sdk` on npm
**GitHub:** https://github.com/CloakedAgent/cloaked
**License:** MIT

---

## Core Concepts

### Agent Key

A base58-encoded Solana keypair that gives spending access within defined limits. Treat it like a private key — whoever has it can spend. Store in `CLOAKED_AGENT_KEY` environment variable. Never log it or commit it to git.

### Vault

A Program Derived Address (PDA) on Solana that holds the agent's SOL (and optionally USDC). Only the agent can spend from it, and only within constraints. Anyone can deposit into it.

### Constraints

On-chain enforced spending limits, checked atomically on every transaction:

| Constraint | Description | Example |
|-----------|-------------|---------|
| `maxPerTx` | Max per single transaction | 0.1 SOL |
| `dailyLimit` | Max per 24-hour period (resets at UTC day boundary) | 0.5 SOL |
| `totalLimit` | Max lifetime spending | 2 SOL |
| `expiresAt` | When the agent stops working | 7 days from now |
| `frozen` | Owner can instantly pause all spending | true/false |

Set any constraint to `0` for unlimited. All values in lamports (1 SOL = 1,000,000,000 lamports).

### Owner vs Agent

- **Owner**: Created the agent. Can freeze, unfreeze, update constraints, withdraw, close. Cannot spend.
- **Agent**: Has the agent key. Can spend within limits. Cannot modify constraints or withdraw.

---

## Integration Options

### Option 1: MCP Server (Recommended for AI Assistants)

For Claude Desktop, Claude Code, Cursor, or any MCP-compatible client.

**Install:**
```bash
npm install @cloakedagent/sdk
```

**Configure (Claude Desktop):**

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`
Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cloaked": {
      "command": "npx",
      "args": ["cloaked-mcp"],
      "env": {
        "CLOAKED_AGENT_KEY": "your-agent-key-here"
      }
    }
  }
}
```

**Configure (Claude Code / .mcp.json):**
```json
{
  "mcpServers": {
    "cloaked": {
      "command": "npx",
      "args": ["cloaked-mcp"],
      "env": {
        "CLOAKED_AGENT_KEY": "your-agent-key-here"
      }
    }
  }
}
```

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOAKED_AGENT_KEY` | Yes | — | Base58 encoded agent key |
| `SOLANA_RPC_URL` | Recommended | devnet | Solana RPC endpoint (use Helius for production) |
| `CLOAKED_BACKEND_URL` | No | `https://api.cloakedagent.com` | Backend API for relayer operations |

### Option 2: TypeScript SDK (Programmatic Control)

For custom agents, LangGraph, n8n, serverless functions, or any Node.js environment.

**Install:**
```bash
npm install @cloakedagent/sdk @solana/web3.js @coral-xyz/anchor
```

**Requires:** Node.js 20+

**Basic usage:**
```typescript
import { CloakedAgent } from "@cloakedagent/sdk";
import { PublicKey } from "@solana/web3.js";

const agent = new CloakedAgent(process.env.CLOAKED_AGENT_KEY!, process.env.SOLANA_RPC_URL!);

// Check balance and limits
const state = await agent.getState();
console.log(`Balance: ${state.balance / 1e9} SOL`);
console.log(`Status: ${state.status}`);
console.log(`Daily remaining: ${state.spending.dailyRemaining / 1e9} SOL`);

// Spend SOL (amount in lamports)
const result = await agent.spend({
  destination: new PublicKey("recipient-address"),
  amount: 10_000_000, // 0.01 SOL
});
console.log(`Signature: ${result.signature}`);

// Spend USDC (amount in native units, 6 decimals)
const usdcResult = await agent.spendToken({
  destination: new PublicKey("recipient-address"),
  mint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // USDC devnet
  amount: 5_000_000, // 5 USDC
});
```

---

## MCP Tools Reference

### cloak_balance

Get current balance, spending limits, and remaining amounts.

**Parameters:** `agent_key` (optional — overrides env var)

**Response:**
```json
{
  "balance_sol": 0.5,
  "balance_lamports": 500000000,
  "daily_spent": 100000000,
  "daily_limit": 500000000,
  "daily_remaining": 400000000,
  "total_spent": 200000000,
  "total_limit": 1000000000,
  "total_remaining": 800000000,
  "expires_in_days": 7,
  "frozen": false,
  "status": "active",
  "tokens": [
    {
      "symbol": "USDC",
      "mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "balance": 50000000,
      "balance_units": 50.0,
      "daily_spent": 5000000,
      "daily_limit": 50000000,
      "daily_remaining": 45000000,
      "total_spent": 10000000,
      "total_limit": 500000000,
      "total_remaining": 490000000
    }
  ]
}
```

### cloak_status

Get detailed agent status with health indicator.

**Parameters:** `agent_key` (optional)

**Response:**
```json
{
  "constraints": {
    "max_per_tx": 100000000,
    "daily_limit": 500000000,
    "total_limit": 1000000000,
    "expires_at": "2026-03-15T00:00:00.000Z"
  },
  "spending": {
    "balance_sol": 0.5,
    "daily_spent": 100000000,
    "total_spent": 200000000
  },
  "health": "ok"
}
```

**Health values:** `ok`, `low_balance` (< 0.01 SOL), `near_daily_limit` (< 10% remaining), `near_total_limit` (< 10% remaining), `frozen`, `expired`

### cloak_pay

Send SOL or tokens to a destination within spending limits.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `destination` | string | Yes | Recipient Solana address (base58) |
| `amount` | number | Yes | Amount in SOL (e.g., 0.1) or token units (e.g., 5.0 for 5 USDC) |
| `token` | string | No | Token symbol (`"USDC"`) or mint address. Omit for SOL. |
| `agent_key` | string | No | Override default agent key |

**Response (success):**
```json
{
  "success": true,
  "signature": "5xK...",
  "remaining_balance": 0.45,
  "daily_remaining": 0.35
}
```

**Response (failure):**
```json
{
  "success": false,
  "signature": "",
  "remaining_balance": 0,
  "daily_remaining": 0,
  "error": "Exceeds daily limit"
}
```

### cloak_x402_fetch

Fetch x402-protected content with automatic payment. Handles the full flow: request, detect 402, parse payment requirements, pay, retry with proof, return content.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | URL to fetch |
| `method` | string | No | HTTP method (GET, POST, PUT, DELETE). Default: GET |
| `headers` | object | No | Custom request headers |
| `body` | string | No | Request body for POST/PUT |
| `agent_key` | string | No | Override default agent key |

**Response:**
```json
{
  "success": true,
  "type": "json",
  "content": { "data": "premium content" },
  "contentType": "application/json",
  "statusCode": 200,
  "payment": {
    "signature": "5xK...",
    "amount_sol": 0.001,
    "amount_lamports": 1000000,
    "recipient": "HN7cAB..."
  }
}
```

Content types: `json` (parsed object), `text` (string), `binary` (base64). The `payment` field is only present if a payment was made.

**Test endpoint:** `https://api.cloakedagent.com/api/x402-test/paid-content` (costs 0.001 SOL on devnet)

---

## SDK Quick Reference

### CloakedAgent Class

```typescript
import { CloakedAgent } from "@cloakedagent/sdk";

// Agent mode — can spend
const agent = new CloakedAgent(agentKey, rpcUrl);

// Owner mode — can manage (freeze, withdraw, etc.) but NOT spend
const agent = CloakedAgent.forOwner(delegatePubkey, rpcUrl);

// Generate new agent (doesn't create on-chain)
const { agent, agentKey } = CloakedAgent.generate(rpcUrl);

// Create on-chain with constraints
const { agent, agentKey, signature } = await CloakedAgent.create(connection, ownerSigner, {
  maxPerTx: 100_000_000,      // 0.1 SOL
  dailyLimit: 500_000_000,    // 0.5 SOL
  totalLimit: 1_000_000_000,  // 1 SOL
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  initialDeposit: 500_000_000, // Optional funding
});
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `publicKey` | `PublicKey` | Agent's public key |
| `agentStatePda` | `PublicKey` | On-chain state account |
| `vaultPda` | `PublicKey` | Vault holding SOL |
| `isPrivateMode` | `boolean` | Whether using ZK proofs |

### Key Methods

**Balance & State (all modes):**
```typescript
await agent.getBalance()          // SOL balance (number)
await agent.getBalanceLamports()  // Lamports balance (number)
await agent.getState()            // Full CloakedAgentState
```

**Spending (agent mode):**
```typescript
await agent.spend({ destination, amount })                // SOL (lamports)
await agent.spend({ destination, amount, feePayer })      // With own fee payer
await agent.spendToken({ destination, mint, amount })     // Token (native units)
```

**Owner management:**
```typescript
await agent.deposit(signer, amount)                       // Fund vault
await agent.freeze(ownerSigner)                           // Pause spending
await agent.unfreeze(ownerSigner)                         // Resume spending
await agent.updateConstraints(ownerSigner, options)       // Change limits
await agent.withdraw(ownerSigner, amount, destination)    // Withdraw (bypasses limits)
await agent.close(ownerSigner)                            // Close & reclaim all
```

**Token operations (owner):**
```typescript
await agent.enableToken(ownerSigner, mint, constraints)
await agent.getTokenBalance(mint)
await agent.getTokenState(mint)
await agent.getEnabledTokens()
await agent.updateTokenConstraints(ownerSigner, mint, options)
await agent.withdrawToken(ownerSigner, mint, amount, destination)
await agent.disableToken(ownerSigner, mint, destination)
```

**Cleanup:**
```typescript
agent.destroy()  // Zero sensitive data from memory
```

### CloakedAgentState

```typescript
{
  address: PublicKey;
  owner: PublicKey | null;       // null for private agents
  delegate: PublicKey;
  balance: number;               // lamports

  constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
    expiresAt: Date | null;
    frozen: boolean;
  };

  spending: {
    totalSpent: number;
    dailySpent: number;
    dailyRemaining: number;
    totalRemaining: number;
  };

  status: "active" | "frozen" | "expired";
  createdAt: Date;
  isPrivate: boolean;
}
```

---

## Constraint System

### Check Order

Every spend transaction is validated in this exact order:

1. Is agent frozen? -> Reject
2. Has agent expired? -> Reject
3. Does amount exceed `maxPerTx`? -> Reject
4. Is it a new UTC day? -> Reset daily counter
5. Would `dailySpent + amount` exceed `dailyLimit`? -> Reject
6. Would `totalSpent + amount` exceed `totalLimit`? -> Reject
7. All checks pass -> Transfer SOL/token from vault

All checks are atomic — if any fails, the entire transaction is rejected.

### Configuration Examples

**Conservative (testing):**
```typescript
{ maxPerTx: 10_000_000, dailyLimit: 50_000_000, totalLimit: 100_000_000, expiresAt: +24h }
// 0.01 SOL/tx, 0.05 SOL/day, 0.1 SOL lifetime
```

**Standard (active agent):**
```typescript
{ maxPerTx: 100_000_000, dailyLimit: 500_000_000, totalLimit: 2_000_000_000, expiresAt: +30d }
// 0.1 SOL/tx, 0.5 SOL/day, 2 SOL lifetime
```

**High-volume (automation):**
```typescript
{ maxPerTx: 500_000_000, dailyLimit: 5_000_000_000, totalLimit: 50_000_000_000, expiresAt: +90d }
// 0.5 SOL/tx, 5 SOL/day, 50 SOL lifetime
```

### Token Constraints

Each enabled token (e.g., USDC) has **independent** constraints from SOL. USDC uses 6 decimals (1 USDC = 1,000,000 native units).

```typescript
await agent.enableToken(owner, USDC_MINT, {
  maxPerTx: 5_000_000,      // 5 USDC
  dailyLimit: 50_000_000,   // 50 USDC/day
  totalLimit: 500_000_000,  // 500 USDC lifetime
});
```

---

## Security Model

### What agents CAN do
- Spend SOL/tokens within defined limits
- Check balance and status
- Fetch x402-protected content (auto-pay)

### What agents CANNOT do
- Spend more than constraints allow (on-chain rejection)
- Modify constraints
- Access funds after expiration
- Freeze/unfreeze themselves
- Transfer ownership
- Withdraw funds

### What owners CAN do
- Freeze/unfreeze (instant pause/resume)
- Update constraints (takes effect immediately)
- Withdraw funds (even if frozen/expired — bypasses all limits)
- Close agent (reclaim everything)
- Deposit more SOL/tokens

### Agent Key Security
- Treat like a private key
- Store in environment variable `CLOAKED_AGENT_KEY`
- Never log, commit, or expose in error messages
- The SDK automatically redacts base58 strings from error output

---

## x402 Protocol

x402 is an open protocol for pay-per-use APIs using HTTP 402 Payment Required. AI agents can access premium services without subscriptions or API keys.

**Flow:**
1. Agent requests resource (normal HTTP)
2. Server returns 402 with `X-PAYMENT-REQUIRED` header (recipient, amount)
3. Agent pays on Solana via Cloaked
4. Agent retries with `X-PAYMENT` header (transaction signature)
5. Server verifies payment on-chain, returns content

The `cloak_x402_fetch` MCP tool handles this entire flow automatically.

**Use cases:** Premium data APIs, AI compute services, research content, agent-to-agent services.

---

## Fee Structure

| Operation | Cost |
|-----------|------|
| Spend (via relayer, default) | amount + ~10,000 lamports (~$0.00001) |
| Spend (own fee payer) | amount + ~5,000 lamports tx fee |
| Create agent (standard) | Rent only (~0.00138 SOL, reclaimable) |
| Create agent (private, via relayer) | 0.01 SOL + rent |
| Private ZK operations | 50,000 lamports (~$0.00005) |

**Why a relayer?** Vault PDAs can't pay transaction fees (no private key), and agent keypairs hold 0 SOL. The relayer fronts the fee, and the vault reimburses atomically in the same transaction.

**Bring your own fee payer (SDK):**
```typescript
await agent.spend({ destination, amount, feePayer: myKeypair });
```
Removes relayer dependency, slightly lower fees.

---

## Privacy Mode

Cloaked supports optional **zero-knowledge proof** privacy:

- **Standard mode:** Owner wallet publicly linked to agent on-chain
- **Private mode:** ZK commitment stored instead of owner address. Wallet-agent link hidden.

Private agents use Noir circuits + Barretenberg proofs verified on-chain. Management operations (freeze, withdraw, etc.) require proving ownership via ZK proof.

Anonymous funding available via Privacy Cash (privacycash.org).

---

## Best Practices for AI Agents

### Before any payment
1. Call `cloak_balance` or `cloak_status` to check current state
2. Verify the amount is within `daily_remaining` and per-transaction limits
3. If `status` is not `"active"`, do not attempt payment
4. Confirm with user before large payments

### Error handling
| Error | Meaning |
|-------|---------|
| Exceeds per-transaction limit | Single payment too large |
| Exceeds daily limit | Daily cap reached, resets at UTC midnight |
| Exceeds total limit | Lifetime cap reached, agent cannot spend more |
| Agent frozen | Owner paused spending |
| Agent expired | Past expiration date |
| Insufficient balance | Vault needs more funds |

### Recommended patterns
- Check balance before spending, not after failure
- Use `health` field from `cloak_status` to warn proactively
- Create separate agents for separate tasks (different budgets)
- Set meaningful expiration dates
- For x402 content, use `cloak_x402_fetch` — it handles the full protocol

---

## LangGraph / Custom Agent Integration

```typescript
import { CloakedAgent } from "@cloakedagent/sdk";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

const cloakedAgent = new CloakedAgent(
  process.env.CLOAKED_AGENT_KEY!,
  process.env.SOLANA_RPC_URL!
);

const payTool = tool(
  async ({ destination, amount }) => {
    const state = await cloakedAgent.getState();
    if (state.status !== "active") return `Cannot pay: agent is ${state.status}`;

    const result = await cloakedAgent.spend({
      destination: new PublicKey(destination),
      amount: Math.floor(amount * 1e9),
    });
    return `Paid ${amount} SOL. Tx: ${result.signature}`;
  },
  {
    name: "cloaked_pay",
    description: "Pay SOL using constrained Cloaked spending account",
    schema: z.object({
      destination: z.string().describe("Solana address (base58)"),
      amount: z.number().describe("Amount in SOL"),
    }),
  }
);
```

Works with any LLM provider (Claude, GPT, etc.) and any framework (LangGraph, n8n, Vercel, serverless).

---

## On-Chain Details

| Item | Value |
|------|-------|
| Blockchain | Solana |
| Program ID (devnet) | `3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB` |
| ZK Verifier (devnet) | `G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F` |
| USDC Mint (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| USDC Mint (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Framework | Anchor |
| Account rent | ~0.00138 SOL (reclaimable on close) |

### PDA Derivation

```
agent_state = findProgramAddress(["cloaked_agent_state", delegate_pubkey], PROGRAM_ID)
vault       = findProgramAddress(["vault", agent_state_pubkey], PROGRAM_ID)
```

---

## Links

- **Website:** https://cloakedagent.com
- **Documentation:** https://cloakedagent.com/docs
- **SDK (npm):** https://www.npmjs.com/package/@cloakedagent/sdk
- **GitHub:** https://github.com/CloakedAgent/cloaked
- **API:** https://api.cloakedagent.com
- **x402 Test Endpoint:** https://api.cloakedagent.com/api/x402-test/paid-content
