"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useAgentToken, useSigner, useHydrated } from "@/hooks";
import { CloakedAgent, CLOAKED_PROGRAM_ID, initProver, isProverReady } from "@cloakedagent/sdk";
import {
  GlassCard,
  Button,
  StatusBadge,
  Skeleton,
  useWalletReady,
  ConnectWalletPrompt,
} from "@/components";
import {
  BalanceStatCard,
  DailySpentCard,
  ConstraintsSection,
  FundingCards,
  AgentDetailsConfig,
  TransactionList,
  CloseAgentModal,
} from "@/components/dashboard";
import { usePrivateMaster } from "@/contexts/PrivateMasterContext";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { getAgentIconSvg, AgentIconType, AGENT_ICONS } from "@/lib/agentIcons";
import { CLOAKED_PROGRAM_ID as PROGRAM_ID } from "@/lib/constants";

// Lazy-loaded poseidon function
let poseidonFn: ((inputs: bigint[]) => Promise<bigint>) | null = null;

async function loadPoseidon() {
  if (poseidonFn) return poseidonFn;
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  poseidonFn = async (inputs: bigint[]): Promise<bigint> => {
    const hash = poseidon(inputs.map((i) => F.e(i)));
    return BigInt(F.toString(hash));
  };
  return poseidonFn;
}

function commitmentToBytes(commitment: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let value = commitment;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return bytes;
}

function commitmentsMatch(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const MAX_NONCES = 100;

export default function AgentDetailPage() {
  const hydrated = useHydrated();
  const params = useParams();
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const walletReady = useWalletReady();
  const { connection } = useConnection();
  const signer = useSigner();
  const delegateId = params.id as string;
  const { token: agent, loading, error, refresh } = useAgentToken(delegateId);
  const { hasMasterSecret, getMasterSecret, isSignatureRequested, deriveMaster } = usePrivateMaster();
  const { getName, setName, getIcon, setIcon } = useAgentNames();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Private agent ownership state
  const [privateOwnerNonce, setPrivateOwnerNonce] = useState<number | null>(null);
  const [privateAgentSecret, setPrivateAgentSecret] = useState<bigint | null>(null);

  useEffect(() => {
    setPrivateOwnerNonce(null);
    setPrivateAgentSecret(null);
  }, [delegateId]);

  useEffect(() => {
    if (!hasMasterSecret || !agent || !agent.isPrivate) return;
    if (privateOwnerNonce !== null) return;

    async function verifyOwnership() {
      try {
        const masterSecret = await getMasterSecret();
        if (!masterSecret) return;

        const poseidon = await loadPoseidon();
        for (let nonce = 0; nonce < MAX_NONCES; nonce++) {
          const agentSecret = await poseidon([masterSecret, BigInt(nonce)]);
          const commitment = await poseidon([agentSecret]);
          const commitmentBytes = commitmentToBytes(commitment);
          if (commitmentsMatch(commitmentBytes, agent!.ownerCommitment)) {
            setPrivateOwnerNonce(nonce);
            setPrivateAgentSecret(agentSecret);
            return;
          }
        }
        setPrivateOwnerNonce(-1);
      } catch {
        // Failed to verify ownership
      }
    }
    verifyOwnership();
  }, [hasMasterSecret, getMasterSecret, agent, privateOwnerNonce]);

  const getTokenForOwner = useCallback(async (): Promise<CloakedAgent> => {
    if (agent?.isPrivate) {
      if (!hasMasterSecret || privateOwnerNonce === null || privateOwnerNonce < 0) {
        throw new Error("Private ownership not verified.");
      }
      const masterSecret = await getMasterSecret();
      if (!masterSecret) {
        throw new Error("Failed to decrypt master secret.");
      }
      if (!isProverReady()) {
        await initProver();
      }
      return CloakedAgent.forPrivateOwner(masterSecret, privateOwnerNonce, connection.rpcEndpoint);
    } else {
      return CloakedAgent.forOwner(delegateId, connection.rpcEndpoint);
    }
  }, [agent?.isPrivate, hasMasterSecret, getMasterSecret, privateOwnerNonce, delegateId, connection.rpcEndpoint]);

  const handleFreeze = useCallback(async () => {
    setActionLoading("freeze");
    setActionError(null);
    try {
      const token = await getTokenForOwner();
      if (agent?.isPrivate) {
        await token.freezePrivate();
      } else {
        if (!signer) return;
        await token.freeze(signer);
      }
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to freeze agent");
    } finally {
      setActionLoading(null);
    }
  }, [signer, agent?.isPrivate, getTokenForOwner, refresh]);

  const handleUnfreeze = useCallback(async () => {
    setActionLoading("unfreeze");
    setActionError(null);
    try {
      const token = await getTokenForOwner();
      if (agent?.isPrivate) {
        await token.unfreezePrivate();
      } else {
        if (!signer) return;
        await token.unfreeze(signer);
      }
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unfreeze agent");
    } finally {
      setActionLoading(null);
    }
  }, [signer, agent?.isPrivate, getTokenForOwner, refresh]);

  const handleUpdateConstraints = useCallback(async (constraints: {
    maxPerTx: number;
    dailyLimit: number;
    totalLimit: number;
    expiresAt: number;
  }) => {
    setActionError(null);
    try {
      const token = await getTokenForOwner();
      const constraintOptions = {
        maxPerTx: constraints.maxPerTx,
        dailyLimit: constraints.dailyLimit,
        totalLimit: constraints.totalLimit,
        expiresAt: constraints.expiresAt > 0 ? new Date(constraints.expiresAt * 1000) : null,
      };
      if (agent?.isPrivate) {
        await token.updateConstraintsPrivate(constraintOptions);
      } else {
        if (!signer) return;
        await token.updateConstraints(signer, constraintOptions);
      }
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update constraints");
      throw err;
    }
  }, [signer, agent?.isPrivate, getTokenForOwner, refresh]);

  const handleClose = useCallback(async (destination: PublicKey) => {
    setActionLoading("close");
    setActionError(null);
    try {
      const token = await getTokenForOwner();
      if (agent?.isPrivate) {
        await token.closePrivate(destination);
      } else {
        if (!signer) return;
        await token.close(signer);
      }
      router.push("/dashboard");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to close agent");
      throw err;
    } finally {
      setActionLoading(null);
    }
  }, [signer, agent?.isPrivate, getTokenForOwner, router]);

  const vaultAddress = useMemo(() => {
    if (!delegateId) return null;
    try {
      const delegatePubkey = new PublicKey(delegateId);
      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegatePubkey.toBuffer()],
        PROGRAM_ID
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentStatePda.toBuffer()],
        PROGRAM_ID
      );
      return vaultPda.toBase58();
    } catch {
      return null;
    }
  }, [delegateId]);

  const agentStatePdaAddress = useMemo(() => {
    if (!delegateId) return null;
    try {
      const delegatePubkey = new PublicKey(delegateId);
      const [agentStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cloaked_agent_state"), delegatePubkey.toBuffer()],
        PROGRAM_ID
      );
      return agentStatePda.toBase58();
    } catch {
      return null;
    }
  }, [delegateId]);

  const displayName = useMemo(() => {
    if (!vaultAddress) return `Agent ${delegateId.slice(0, 4)}...`;
    return getName(vaultAddress) || `Agent ${delegateId.slice(0, 4)}...`;
  }, [vaultAddress, delegateId, getName]);

  const currentIcon = useMemo(() => {
    if (!vaultAddress) return "chip" as AgentIconType;
    return getIcon(vaultAddress);
  }, [vaultAddress, getIcon]);

  const handleIconChange = useCallback((icon: AgentIconType) => {
    if (vaultAddress) {
      setIcon(vaultAddress, icon);
      setIsIconPickerOpen(false);
    }
  }, [vaultAddress, setIcon]);

  const handleSaveName = useCallback(() => {
    if (vaultAddress && editedName.trim()) {
      setName(vaultAddress, editedName.trim());
      setIsEditingName(false);
    }
  }, [vaultAddress, editedName, setName]);

  // Show loading while hydrating or wallet is initializing
  if (!hydrated || !walletReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--cloak-text-muted)]">Loading...</div>
      </div>
    );
  }

  // Show connect prompt if not connected
  if (!connected) {
    return (
      <ConnectWalletPrompt
        title="Connect Wallet"
        description="Connect your wallet to view this agent."
      />
    );
  }

  if (loading) {
    return (
      <div className="py-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <Skeleton className="w-32 h-4" />
        </div>
        <div className="detail-card mb-6">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="w-16 h-16 rounded-2xl" />
            <div>
              <Skeleton className="w-48 h-6 mb-2" />
              <Skeleton className="w-24 h-4" />
            </div>
          </div>
          <Skeleton className="w-full h-32" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="py-8 max-w-5xl mx-auto">
        <GlassCard className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-error)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--cloak-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Agent Not Found</h2>
          <p className="text-[var(--cloak-text-muted)] mb-6">
            {error || "This agent doesn't exist or you don't have access to it."}
          </p>
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  // For private agents, show signature prompt if not yet verified
  if (agent.isPrivate && !hasMasterSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <GlassCard className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-cyan)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--cloak-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2 text-[var(--cloak-text-primary)]">
            Cloaked Agent Access
          </h3>
          <p className="text-[var(--cloak-text-muted)] max-w-sm mx-auto mb-6">
            This is a Cloaked Agent. Sign to verify ownership and unlock management features.
          </p>
          <Button
            onClick={deriveMaster}
            loading={isSignatureRequested}
            fullWidth
          >
            {isSignatureRequested ? "Sign in wallet..." : "Sign to Unlock"}
          </Button>
        </GlassCard>
      </div>
    );
  }

  // For private agents, show verification in progress
  if (agent.isPrivate && hasMasterSecret && privateOwnerNonce === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <GlassCard className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-cyan)]/20 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-[var(--cloak-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2 text-[var(--cloak-text-primary)]">
            Verifying Ownership
          </h3>
          <p className="text-[var(--cloak-text-muted)]">
            Checking if this agent belongs to your wallet...
          </p>
        </GlassCard>
      </div>
    );
  }

  // For Cloaked Agents, show access denied if not owner
  if (agent.isPrivate && privateOwnerNonce === -1) {
    return (
      <div className="py-8 max-w-5xl mx-auto">
        <GlassCard className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-error)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--cloak-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-[var(--cloak-text-muted)] mb-6">
            This Cloaked Agent does not belong to your wallet.
          </p>
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  const isOwner = agent.isPrivate
    ? privateOwnerNonce !== null && privateOwnerNonce >= 0
    : !!(publicKey && agent.owner && agent.owner.equals(publicKey));

  return (
    <div className="py-8 max-w-5xl mx-auto animate-reveal">
      {/* Back Link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)] transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Action Error */}
      {actionError && (
        <div className="glass-card p-4 mb-6 border-[var(--cloak-error)]/30">
          <div className="flex items-center gap-3 text-[var(--cloak-error)]">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-auto text-[var(--cloak-text-muted)] hover:text-[var(--cloak-text-primary)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Close Agent Modal */}
      {publicKey && (
        <CloseAgentModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onConfirm={handleClose}
          vaultBalance={agent.balance}
          isPrivate={agent.isPrivate}
          connectedWallet={publicKey}
        />
      )}

      {/* Icon picker modal */}
      {isIconPickerOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsIconPickerOpen(false)}
          />
          <div className="absolute left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-40 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 shadow-2xl max-w-xs sm:max-w-none mx-auto sm:mx-0">
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3">Choose Icon</div>
            <div className="grid grid-cols-4 gap-2">
              {AGENT_ICONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => handleIconChange(id)}
                  title={label}
                  className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${
                    currentIcon === id
                      ? "bg-[#8b5cf6]/20 border border-[#8b5cf6] text-[#8b5cf6]"
                      : "bg-[#111] border border-[#1a1a1a] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {getAgentIconSvg(id, { className: "w-6 h-6" })}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 animate-reveal">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Icon */}
          <button
            onClick={() => isOwner && setIsIconPickerOpen(true)}
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
              agent.isPrivate
                ? "bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#a78bfa]"
                : "bg-[#0a0a0a] border border-[#1a1a1a] text-zinc-400"
            } ${isOwner ? "cursor-pointer hover:border-zinc-600 hover:text-white" : "cursor-default"}`}
            title={isOwner ? "Change icon" : undefined}
          >
            {getAgentIconSvg(currentIcon, { className: "w-7 h-7" })}
          </button>

          <div>
            <div className="flex items-center space-x-4 mb-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-[32px] font-bold tracking-tight bg-transparent border-b-2 border-[#8b5cf6] outline-none text-white"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                />
                <button onClick={handleSaveName} className="text-[var(--cloak-success)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button onClick={() => setIsEditingName(false)} className="text-zinc-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-xl sm:text-[32px] font-bold tracking-tight text-white">{displayName}</h1>
                {isOwner && (
                  <button
                    onClick={() => {
                      setEditedName(displayName);
                      setIsEditingName(true);
                    }}
                    className="text-zinc-500 hover:text-[#8b5cf6] transition-colors"
                    title="Edit name"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </>
            )}
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-[13px] text-zinc-500">
            ID: {delegateId.slice(0, 8)}...{delegateId.slice(-6)}
          </p>
          {agent.isPrivate && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30 mt-1.5">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
              Cloaked
            </span>
          )}
          </div>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2 sm:space-x-3 flex-wrap sm:flex-nowrap">
            {agent.status === "frozen" ? (
              <button
                className="px-4 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md text-[13px] font-semibold flex items-center space-x-2 hover:bg-[#111111] hover:border-zinc-700 transition-all text-white"
                onClick={handleUnfreeze}
                disabled={actionLoading === "unfreeze"}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z" />
                </svg>
                <span>{actionLoading === "unfreeze" ? "..." : "Unfreeze"}</span>
              </button>
            ) : (
              <button
                className="px-4 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md text-[13px] font-semibold flex items-center space-x-2 hover:bg-[#111111] hover:border-zinc-700 transition-all text-white disabled:opacity-50"
                onClick={handleFreeze}
                disabled={actionLoading === "freeze" || agent.status === "expired"}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
                <span>{actionLoading === "freeze" ? "..." : "Freeze"}</span>
              </button>
            )}
            <button
              className="px-4 py-2.5 bg-red-950/20 border border-red-900/30 rounded-md text-[13px] font-semibold flex items-center space-x-2 hover:bg-red-950/40 hover:border-red-800/50 transition-all text-red-400"
              onClick={() => setIsCloseModalOpen(true)}
              disabled={actionLoading === "close"}
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span>{actionLoading === "close" ? "Closing..." : "Close Agent"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8 animate-reveal animate-reveal-delay-1">
        <BalanceStatCard agent={agent} />
        <DailySpentCard agent={agent} />
      </div>

      {/* Spending Constraints */}
      {isOwner && (
        <div className="mb-8 animate-reveal animate-reveal-delay-2">
          <ConstraintsSection
            agent={agent}
            isOwner={isOwner}
            onSave={handleUpdateConstraints}
          />
        </div>
      )}

      {/* Funding Cards (owner only) */}
      {isOwner && (
        <div className="mb-8 animate-reveal animate-reveal-delay-3">
          <FundingCards
            delegateId={delegateId}
            isPrivate={agent.isPrivate}
            onFundSuccess={refresh}
          />
        </div>
      )}

      {/* Agent Details & Configuration */}
      <div className="mb-8 animate-reveal animate-reveal-delay-4">
        <AgentDetailsConfig
          delegateId={delegateId}
          vaultAddress={vaultAddress}
          agentStatePdaAddress={agentStatePdaAddress}
        />
      </div>

      {/* Recent Transactions */}
      <div className="animate-reveal animate-reveal-delay-4">
        <TransactionList delegateId={delegateId} />
      </div>
    </div>
  );
}
