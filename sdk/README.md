# @cloakedagent/sdk

**Trustless spending accounts for AI agents on Solana**

Give AI agents spending power without giving them your wallet keys. On-chain enforced limits they literally cannot bypass.

[Documentation](https://cloakedagent.com/docs) · [Website](https://cloakedagent.com) · [GitHub](https://github.com/CloakedAgent/cloaked)

## Installation

```bash
npm install @cloakedagent/sdk
```

## Quick Start

### For AI Agents (MCP)

Add to your Claude Desktop or MCP-compatible client:

```json
{
  "mcpServers": {
    "cloaked": {
      "command": "npx",
      "args": ["@cloakedagent/sdk/mcp"],
      "env": {
        "CLOAKED_AGENT_KEY": "your-agent-key-here"
      }
    }
  }
}
```

### For Developers

```typescript
import { CloakedAgent } from "@cloakedagent/sdk";

// Load agent from key
const agent = new CloakedAgent(agentKey, rpcUrl);

// Check balance
const balance = await agent.getBalance();

// Spend within limits
await agent.spend({
  destination: recipientPubkey,
  amount: 100_000_000 // 0.1 SOL in lamports
});
```

## Features

- **On-chain constraints** - Per-tx, daily, and total limits enforced by Solana program
- **MCP integration** - Works with Claude and other AI agents via Model Context Protocol
- **x402 support** - Automatic payment for pay-per-use APIs
- **Privacy mode** - Optional ZK proofs to hide wallet-agent link

## API

### `CloakedAgent`

```typescript
// Create from agent key
const agent = new CloakedAgent(agentKey: string, rpcUrl: string);

// Properties
agent.publicKey      // Agent's public key
agent.vaultPda       // Vault address (holds funds)
agent.agentStatePda  // State account address

// Methods
await agent.getBalance()           // Get vault balance in lamports
await agent.getStatus()            // Get full status with constraints
await agent.spend({ destination, amount })  // Spend SOL
```

### MCP Tools

When running as MCP server, provides these tools:

- `cloak_balance` - Check available balance
- `cloak_status` - Get spending limits and constraints
- `cloak_pay` - Send SOL to destination
- `cloak_x402_fetch` - Fetch x402-protected resources with auto-payment

## License

MIT
