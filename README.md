# Cloaked

**Trustless spending accounts for AI agents on Solana**

[cloakedagent.com](https://cloakedagent.com)

---

## The Problem

AI agents need to spend money autonomously. But giving them wallet access is dangerous:

- **Jailbroken agent?** Drains your wallet
- **Bug in agent code?** Infinite spending loop
- **Prompt injection?** Attacker controls your funds

Agent-side limits don't work - the agent has the keys and can bypass its own rules.

## The Solution

**On-chain enforced constraints that agents literally cannot bypass.**

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLOAKED AGENT                              │
├─────────────────────────────────────────────────────────────────┤
│  Owner: Human wallet (full control)                             │
│  Delegate: AI agent key (can spend within limits)               │
│                                                                 │
│  Constraints (enforced by Solana program):                      │
│  ├── max_per_tx: 0.1 SOL                                        │
│  ├── daily_limit: 1 SOL                                         │
│  ├── total_limit: 10 SOL                                        │
│  └── expires_at: 2026-02-15                                     │
│                                                                 │
│  Even if jailbroken, agent CANNOT exceed these limits.          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Privacy Architecture

Cloaked offers **dual-mode privacy**:

### Standard Mode
- Owner wallet linked to agent on-chain
- Simple setup, lower fees

### Private Mode (ZK)
- **Zero-knowledge proofs** hide wallet-agent link
- Owner proves ownership without revealing identity
- Funded anonymously via **[Privacy Cash](https://privacycash.org)**

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRIVACY STACK                                │
├─────────────────────────────────────────────────────────────────┤
│  ZK Circuits:      Noir (Aztec)                                 │
│  Client Prover:    Barretenberg (UltraHonk via WASM)            │
│  On-chain Verify:  Sunspot (Groth16 on Solana)                  │
│  Hash Function:    Poseidon (ZK-friendly)                       │
│  Anonymous Funding: Privacy Cash (privacycash.org)              │
└─────────────────────────────────────────────────────────────────┘

Private Agent Creation:
  Wallet signs message → Master secret derived → Commitment generated
  On-chain: owner_commitment (hash), NOT wallet address
  To manage: Prove knowledge of preimage via ZK proof
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Blockchain | [Solana](https://solana.com) |
| RPC | [Helius](https://helius.dev) |
| Smart Contract | Anchor Framework |
| ZK Proofs | [Noir](https://noir-lang.org) + Barretenberg + Sunspot |
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Express.js (Relayer) |
| AI Integration | MCP (Model Context Protocol) |
| x402 Payments | Native support |

### Program IDs (Devnet)

```
Cloaked Program: 3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB
ZK Verifier:     G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F
```

---

## Key Features

### 1. On-Chain Constraints
- Per-transaction limits
- Daily spending caps
- Lifetime limits
- Expiration dates
- Instant freeze

### 2. Privacy Options
- Standard mode (simple)
- Private mode (ZK proofs)
- Anonymous funding (Privacy Cash)

### 3. x402 Protocol Support
- Automatic payment handling
- Pay-per-use APIs
- AI service payments

### 4. Multi-Agent Dashboard
- Create/manage multiple agents
- Real-time spending visibility
- One-click freeze

---

## Quick Start

### For AI Agents (MCP)

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

### For Developers (SDK)

```bash
npm install @cloakedagent/sdk
```

```typescript
import { CloakedAgent } from "@cloakedagent/sdk";

// Load agent (can spend)
const agent = new CloakedAgent(agentKey, rpcUrl);

// Spend within limits
await agent.spend({
  destination: recipientPubkey,
  amount: 100_000_000  // 0.1 SOL
});
```

---

## Project Structure

```
cloaked/
├── programs/cloaked/     # Anchor program (constraints, ZK verification)
├── circuits/             # Noir ZK circuits (ownership proofs)
├── app/                  # Next.js frontend (dashboard, docs)
├── backend/              # Express relayer (fee payer, ZK ops)
└── sdk/                  # TypeScript SDK (@cloakedagent/sdk)
    └── src/mcp/          # MCP server (cloaked-mcp binary)
```

---

## Documentation

Full documentation available at [cloakedagent.com/docs](https://cloakedagent.com/docs)

---

## Why Cloaked?

| Problem | Cloaked Solution |
|---------|------------------|
| AI can drain wallet | On-chain limits can't be bypassed |
| No spending visibility | Real-time dashboard |
| Can't stop runaway agent | Instant freeze |
| Wallet identity exposed | Private mode with ZK proofs |
| Complex integrations | Native x402 support |

---

*Cloaked - Trustless spending accounts for AI agents*
