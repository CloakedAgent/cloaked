# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Cloaked, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

Email: **security@cloakedagent.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 7 days
- **Resolution Timeline:** Depends on severity, typically 30-90 days

We will keep you informed throughout the process.

## Scope

### In Scope

- Solana program (`programs/cloaked/`)
- Backend relayer (`backend/`)
- SDK (`sdk/`)
- Frontend application (`app/`)
- ZK circuits (`circuits/`)

### Out of Scope

- Third-party dependencies (report to their maintainers)
- Social engineering attacks
- DoS attacks on public infrastructure
- Issues already known and being addressed

## Security Design

### Key Management

| Secret | Storage | Notes |
|--------|---------|-------|
| Agent Key | Client-side only | Never sent to backend, never logged |
| Master Secret | Client-side only | Derives agent keys, never leaves browser |
| Relayer Private Key | Server env var | Signs transactions, minimal balance |

### What We Never Do

- Log private keys or secrets (even partially)
- Store user secrets on backend
- Include secrets in error messages
- Commit `.env` files to git

### ZK Privacy Model

- User identity is protected via zero-knowledge proofs
- On-chain: only commitments visible, not secrets
- Agent ownership proven without revealing master secret

## Bug Bounty

We do not currently have a formal bug bounty program. However, we deeply appreciate responsible disclosure and will:

- Credit you in our changelog (if desired)
- Provide a reference letter for security researchers (if requested)

## Security Updates

Security patches are released as soon as possible after verification. Watch this repository for releases or subscribe to notifications.

## Contact

- Security issues: security@cloakedagent.com
- General questions: GitHub Issues
