"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { CloakedAgent, getNextPrivateNonce, getRelayerStatus, RelayerStatus } from "@cloakedagent/sdk";
import { useSigner, useHydrated } from "@/hooks";
import { usePrivacyCash } from "@/contexts/PrivacyCashContext";
import { useAgentNames } from "@/contexts/AgentNamesContext";
import { GlassCard, Button, Input, useWalletReady, ConnectWalletPrompt, IconPicker, DemoTipbox } from "@/components";
import { formatSol, solToLamports, lamportsToSol } from "@/lib/cloaked";
import { AgentIconType, DEFAULT_AGENT_ICON } from "@/lib/agentIcons";
import { CLOAKED_PROGRAM_ID } from "@/lib/constants";

type CreateMode = "quick" | "guided" | "bulk";
type Step = "name" | "constraints" | "funding" | "review" | "success";

interface ConstraintPreset {
  name: string;
  description: string;
  maxPerTx: number;
  dailyLimit: number;
  totalLimit: number;
}

const PRESETS: Record<string, ConstraintPreset> = {
  conservative: {
    name: "Conservative",
    description: "Tight limits for testing",
    maxPerTx: 0.01 * 1e9,
    dailyLimit: 0.1 * 1e9,
    totalLimit: 1 * 1e9,
  },
  standard: {
    name: "Standard",
    description: "Balanced for most use cases",
    maxPerTx: 0.1 * 1e9,
    dailyLimit: 1 * 1e9,
    totalLimit: 10 * 1e9,
  },
  unlimited: {
    name: "Unlimited",
    description: "No spending limits",
    maxPerTx: 0,
    dailyLimit: 0,
    totalLimit: 0,
  },
};

const DEFAULT_CONSTRAINTS = PRESETS.standard;

interface CreatedAgent {
  name: string;
  agentKey: string;
  delegate: string;
  signature: string;
  vaultPda?: string;
}

function CreateAgentContent() {
  const hydrated = useHydrated();
  const { connected, publicKey, signMessage } = useWallet();
  const walletReady = useWalletReady();
  const { connection } = useConnection();
  const signer = useSigner();
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode") as CreateMode | null;
  const { setAgentData } = useAgentNames();

  const [mode, setMode] = useState<CreateMode>(modeParam || "quick");
  const [step, setStep] = useState<Step>("name");

  // Privacy mode state (standard = wallet visible, private = full anonymity via relayer)
  const [privacyMode, setPrivacyMode] = useState<"standard" | "private">("standard");
  const [masterSecret, setMasterSecret] = useState<bigint | null>(null);
  const [derivingSecret, setDerivingSecret] = useState(false);
  const [relayerStatus, setRelayerStatus] = useState<RelayerStatus | null>(null);
  const [relayerReady, setRelayerReady] = useState<boolean | null>(null);

  // Privacy Cash for private agents
  const { status: privacyCashStatus, balance: privacyCashBalance, withdraw: privacyCashWithdraw, initialize: initializePrivacyCash } = usePrivacyCash();
  const privacyCashReady = privacyCashStatus === "ready";

  // Form state
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<AgentIconType>(DEFAULT_AGENT_ICON);
  const [fundingAmount, setFundingAmount] = useState("0.1");
  const [selectedPreset, setSelectedPreset] = useState<string>("standard");
  const [customConstraints, setCustomConstraints] = useState({
    maxPerTx: "",
    dailyLimit: "",
    totalLimit: "",
    expiresIn: "",
  });
  const [bulkCount, setBulkCount] = useState("3");
  const [bulkNameTemplate, setBulkNameTemplate] = useState("Agent");

  // Status
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgents, setCreatedAgents] = useState<CreatedAgent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Leave confirmation modal
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"dashboard" | "create" | null>(null);

  // Show connect prompt if not connected (don't redirect - better UX for new tabs)

  // Update mode from URL
  useEffect(() => {
    if (modeParam && ["quick", "guided", "bulk"].includes(modeParam)) {
      setMode(modeParam);
    }
  }, [modeParam]);

  // Check relayer status
  useEffect(() => {
    const checkRelayer = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3645";
        const status = await getRelayerStatus(apiUrl);
        setRelayerStatus(status);
        setRelayerReady(status.ready);
      } catch {
        setRelayerReady(false);
      }
    };
    checkRelayer();
  }, []);

  // Warn user before leaving success page
  useEffect(() => {
    if (step !== "success" || createdAgents.length === 0) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step, createdAgents.length]);

  // Calculate fee and total for private mode
  const creationFee = relayerStatus?.creationFee ?? 10_000_000; // 0.01 SOL default
  const vaultFunding = privacyMode === "private" ? solToLamports(parseFloat(fundingAmount) || 0) : 0;
  const totalDeposit = creationFee + vaultFunding;

  const getConstraints = useCallback(() => {
    // Always use custom constraints if set, otherwise fall back to preset/defaults
    const preset = PRESETS[selectedPreset] || DEFAULT_CONSTRAINTS;
    return {
      maxPerTx: customConstraints.maxPerTx
        ? solToLamports(parseFloat(customConstraints.maxPerTx))
        : preset.maxPerTx,
      dailyLimit: customConstraints.dailyLimit
        ? solToLamports(parseFloat(customConstraints.dailyLimit))
        : preset.dailyLimit,
      totalLimit: customConstraints.totalLimit
        ? solToLamports(parseFloat(customConstraints.totalLimit))
        : preset.totalLimit,
      expiresAt: customConstraints.expiresIn
        ? Math.floor(Date.now() / 1000) + parseInt(customConstraints.expiresIn) * 86400
        : 0,
    };
  }, [selectedPreset, customConstraints]);

  // Derive master secret from wallet signature
  const handleDeriveMasterSecret = useCallback(async () => {
    if (!signMessage || masterSecret) return;
    setDerivingSecret(true);
    setError(null);
    try {
      const message = new TextEncoder().encode("Cloak Private Agent");
      const signature = await signMessage(message);
      const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(signature));
      const hashArray = new Uint8Array(hashBuffer);
      let secret = BigInt(0);
      for (let i = 0; i < 31; i++) {
        secret = (secret << BigInt(8)) | BigInt(hashArray[i]);
      }
      setMasterSecret(secret);
    } catch (err) {
      setError("Failed to sign message. Please try again.");
    } finally {
      setDerivingSecret(false);
    }
  }, [signMessage, masterSecret]);

  const createAgent = useCallback(async (agentName: string): Promise<CreatedAgent> => {
    if (!publicKey || !signer) {
      throw new Error("Wallet not connected");
    }

    const constraints = getConstraints();
    const fundingLamports = solToLamports(parseFloat(fundingAmount));

    const { agent, agentKey, signature } = await CloakedAgent.create(
      connection,
      signer,
      {
        maxPerTx: constraints.maxPerTx,
        dailyLimit: constraints.dailyLimit,
        totalLimit: constraints.totalLimit,
        expiresAt: constraints.expiresAt > 0 ? new Date(constraints.expiresAt * 1000) : null,
        initialDeposit: fundingLamports,
      }
    );

    // Derive vault address and save name to localStorage
    const [agentStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cloaked_agent_state"), agent.publicKey.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentStatePda.toBuffer()],
      CLOAKED_PROGRAM_ID
    );
    if (agentName) {
      setAgentData(vaultPda.toBase58(), agentName, selectedIcon);
    }

    return {
      name: agentName,
      agentKey,
      delegate: agent.publicKey.toBase58(),
      signature,
    };
  }, [publicKey, signer, connection, getConstraints, fundingAmount, selectedIcon, setAgentData]);

  // Create a private agent (relayer signs, wallet never on-chain, full anonymity)
  const createPrivateAgent = useCallback(async (agentName: string): Promise<CreatedAgent> => {
    if (!masterSecret) {
      throw new Error("Master secret not derived");
    }
    if (!relayerStatus?.address) {
      throw new Error("Relayer not available");
    }
    if (!privacyCashReady) {
      throw new Error("Privacy Cash not initialized");
    }
    if (privacyCashBalance !== null && totalDeposit > privacyCashBalance) {
      throw new Error(`Insufficient Privacy Cash balance. Need ${lamportsToSol(totalDeposit)} SOL`);
    }

    // Step 1: Send total deposit to relayer via Privacy Cash
    const relayerAddress = new PublicKey(relayerStatus.address);
    const depositResult = await privacyCashWithdraw(lamportsToSol(totalDeposit), relayerAddress);

    // Step 2: Create agent via relayer
    const constraints = getConstraints();
    const nonce = await getNextPrivateNonce(masterSecret, connection);
    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3645";

    const { agent, agentKey, signature, vaultPda } = await CloakedAgent.createPrivateViaRelayer(
      masterSecret,
      nonce,
      {
        maxPerTx: constraints.maxPerTx,
        dailyLimit: constraints.dailyLimit,
        totalLimit: constraints.totalLimit,
        expiresAt: constraints.expiresAt > 0 ? new Date(constraints.expiresAt * 1000) : null,
      },
      depositResult.tx, // Privacy Cash tx signature
      totalDeposit, // Total lamports sent (fee + funding)
      connection.rpcEndpoint,
      apiUrl
    );

    if (agentName) {
      setAgentData(vaultPda.toBase58(), agentName, selectedIcon);
    }

    return {
      name: agentName,
      agentKey,
      delegate: agent.publicKey.toBase58(),
      signature,
      vaultPda: vaultPda.toBase58(),
    };
  }, [connection, masterSecret, getConstraints, relayerStatus, privacyCashReady, privacyCashBalance, privacyCashWithdraw, totalDeposit, creationFee, vaultFunding, selectedIcon, setAgentData]);

  const handleQuickCreate = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      const agentName = name || `Agent #${Date.now().toString().slice(-4)}`;
      let agent: CreatedAgent;
      if (privacyMode === "private") {
        agent = await createPrivateAgent(agentName);
      } else {
        agent = await createAgent(agentName);
      }
      setCreatedAgents([agent]);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }, [name, privacyMode, createAgent, createPrivateAgent]);

  const handleGuidedCreate = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      let agent: CreatedAgent;
      if (privacyMode === "private") {
        agent = await createPrivateAgent(name);
      } else {
        agent = await createAgent(name);
      }
      setCreatedAgents([agent]);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }, [name, privacyMode, createAgent, createPrivateAgent]);

  const handleBulkCreate = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      const count = parseInt(bulkCount) || 1;
      const agents: CreatedAgent[] = [];

      for (let i = 1; i <= count; i++) {
        const agentName = `${bulkNameTemplate} #${i}`;
        let agent: CreatedAgent;
        if (privacyMode === "private") {
          agent = await createPrivateAgent(agentName);
        } else {
          agent = await createAgent(agentName);
        }
        agents.push(agent);
      }

      setCreatedAgents(agents);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agents");
    } finally {
      setCreating(false);
    }
  }, [bulkCount, bulkNameTemplate, privacyMode, createAgent, createPrivateAgent]);

  const handleCopy = useCallback(async (agentKey: string) => {
    try {
      await navigator.clipboard.writeText(agentKey);
      setCopied(agentKey);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = agentKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(agentKey);
      setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  // Show loading while hydrating or wallet is initializing (autoConnect in progress)
  if (!hydrated || !walletReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--cloak-text-muted)]">Loading...</div>
      </div>
    );
  }

  if (!connected) {
    return (
      <ConnectWalletPrompt
        title="Connect Wallet"
        description="Connect your wallet to create an agent."
      />
    );
  }

  // Success State
  if (step === "success" && createdAgents.length > 0) {
    return (
      <div className="min-h-screen relative z-10">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <GlassCard className="animate-reveal">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-success)]/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--cloak-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">
                {createdAgents.some(a => a.vaultPda)
                  ? (createdAgents.length === 1 ? "Cloaked Agent Created!" : `${createdAgents.length} Cloaked Agents Created!`)
                  : (createdAgents.length === 1 ? "Agent Created!" : `${createdAgents.length} Agents Created!`)}
              </h1>
              <p className="text-[var(--cloak-text-muted)]">
                Save the Agent Key{createdAgents.length > 1 ? "s" : ""} below - you won&apos;t see {createdAgents.length > 1 ? "them" : "it"} again!
              </p>
            </div>

            {/* Warning */}
            <div className="bg-[var(--cloak-warning)]/10 border border-[var(--cloak-warning)]/30 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-[var(--cloak-warning)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div className="font-medium text-[var(--cloak-warning)]">Important</div>
                  <div className="text-sm text-[var(--cloak-warning)]/80">
                    Agent Keys are like private keys. Anyone with the key can spend the agent&apos;s funds within its constraints.
                  </div>
                </div>
              </div>
            </div>

            {/* Created Agents */}
            <div className="space-y-4 mb-8">
              {createdAgents.map((agent, index) => (
                <div key={agent.delegate} className="bg-[var(--cloak-surface)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{agent.name}</div>
                    <button
                      onClick={() => handleCopy(agent.agentKey)}
                      className="text-sm text-[var(--cloak-violet)] hover:text-[var(--cloak-violet-dim)] transition-colors"
                    >
                      {copied === agent.agentKey ? "Copied!" : "Copy Key"}
                    </button>
                  </div>
                  <div
                    onClick={() => handleCopy(agent.agentKey)}
                    className="bg-[var(--cloak-deep)] rounded-lg p-3 cursor-pointer hover:bg-[var(--cloak-elevated)] transition-colors mb-3"
                  >
                    <code className="text-xs text-[var(--cloak-success)] font-mono break-all">
                      {agent.agentKey}
                    </code>
                  </div>
                  {agent.vaultPda && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-[var(--cloak-text-muted)]">Vault Address (for funding)</div>
                        <button
                          onClick={() => handleCopy(agent.vaultPda!)}
                          className="text-xs text-[var(--cloak-cyan)] hover:text-[var(--cloak-cyan)]/80 transition-colors"
                        >
                          {copied === agent.vaultPda ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <div
                        onClick={() => handleCopy(agent.vaultPda!)}
                        className="bg-[var(--cloak-deep)] rounded-lg p-2 cursor-pointer hover:bg-[var(--cloak-elevated)] transition-colors"
                      >
                        <code className="text-xs text-[var(--cloak-cyan)] font-mono break-all">
                          {agent.vaultPda}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                variant="secondary"
                fullWidth
                className="flex-1"
                onClick={() => {
                  setPendingAction("dashboard");
                  setShowLeaveConfirm(true);
                }}
              >
                Back to Dashboard
              </Button>
              <Button
                onClick={() => {
                  setPendingAction("create");
                  setShowLeaveConfirm(true);
                }}
                fullWidth
                className="flex-1"
              >
                Create Another
              </Button>
            </div>
          </GlassCard>

          {/* Leave Confirmation Modal */}
          {showLeaveConfirm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-reveal">
              <div className="glass-card rounded-xl p-6 max-w-md mx-4 border border-[var(--cloak-warning)]/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--cloak-warning)]/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--cloak-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white">Did you save your Agent Key?</h3>
                </div>
                <p className="text-[var(--cloak-text-muted)] mb-6">
                  You won&apos;t be able to see the Agent Key again after leaving this page. Make sure you&apos;ve copied and saved it securely.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      setShowLeaveConfirm(false);
                      setPendingAction(null);
                    }}
                  >
                    Go Back
                  </Button>
                  <Button
                    fullWidth
                    onClick={() => {
                      if (pendingAction === "dashboard") {
                        router.push("/dashboard");
                      } else if (pendingAction === "create") {
                        setCreatedAgents([]);
                        setStep("name");
                        setName("");
                        setSelectedIcon(DEFAULT_AGENT_ICON);
                      }
                      setShowLeaveConfirm(false);
                      setPendingAction(null);
                    }}
                  >
                    Yes, I&apos;ve Saved It
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="create-page animate-reveal">
      {/* Back Link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 group"
      >
        <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="text-[13px] font-medium">Back to Dashboard</span>
      </Link>

      {/* Page Title */}
      <h1 className="text-[28px] font-bold text-white tracking-tight mb-8">Create Agent</h1>

      {/* Agent Privacy Section */}
      <div className="mb-8">
        <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3">Agent Privacy</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Standard Mode Card */}
          <button
            type="button"
            onClick={() => setPrivacyMode("standard")}
            className={`relative px-4 py-3 rounded-xl cursor-pointer transition-all text-left ${
              privacyMode === "standard"
                ? "glass-card-active-green"
                : "glass-card border-[#1a1a1a] hover:bg-[#111] hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <svg className={`w-[22px] h-[22px] ${privacyMode === "standard" ? "text-[#10b981]" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className={`text-[14px] font-bold ${privacyMode === "standard" ? "text-white" : "text-zinc-500"}`}>Standard</h4>
              </div>
              <div className={`w-4 h-4 rounded-full shrink-0 ${
                privacyMode === "standard"
                  ? "border-[4px] border-[#10b981] bg-black"
                  : "border border-zinc-700 bg-transparent"
              }`} />
            </div>
            <p className={`text-[12px] font-medium mt-1 pl-[34px] ${privacyMode === "standard" ? "text-zinc-400" : "text-zinc-600"}`}>
              Wallet address visible on-chain
            </p>
          </button>

          {/* Cloaked Mode Card */}
          <button
            type="button"
            onClick={() => {
              if (relayerReady !== false) {
                setPrivacyMode("private");
                if (!masterSecret) {
                  handleDeriveMasterSecret();
                }
              }
            }}
            disabled={relayerReady === false}
            className={`relative px-4 py-3 rounded-xl cursor-pointer transition-all text-left ${
              privacyMode === "private"
                ? "glass-card-active"
                : "glass-card border-[#1a1a1a] hover:bg-[#111] hover:border-zinc-700"
            } ${relayerReady === false ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <svg className={`w-[22px] h-[22px] ${privacyMode === "private" ? "text-[#8b5cf6]" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <h4 className={`text-[14px] font-bold ${privacyMode === "private" ? "text-white" : "text-zinc-500"}`}>
                  Cloaked
                  {relayerReady === false && <span className="ml-2 text-xs text-zinc-600">(unavailable)</span>}
                </h4>
              </div>
              <div className={`w-4 h-4 rounded-full shrink-0 ${
                privacyMode === "private"
                  ? "border-[4px] border-[#8b5cf6] bg-black"
                  : "border border-zinc-700 bg-transparent"
              }`} />
            </div>
            <p className={`text-[12px] font-medium mt-1 pl-[34px] ${privacyMode === "private" ? "text-zinc-400" : "text-zinc-600"}`}>
              Private mode with ZK proofs
            </p>
          </button>
        </div>

        {/* Demo tipbox for private mode */}
        {privacyMode === "private" && (
          <DemoTipbox className="mt-4" compact />
        )}
      </div>

      {/* Mode Tabs - Underline Style */}
      <div className="mb-8">
        <div className="flex border-b border-[#1a1a1a] mb-4">
          {[
            { key: "quick", label: "Quick" },
            { key: "guided", label: "Guided" },
            { key: "bulk", label: "Bulk" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setMode(key as CreateMode);
                setStep("name");
                router.push(`/dashboard/create-agent?mode=${key}`, { scroll: false });
              }}
              className={`px-6 py-3 text-[13px] font-medium transition-colors ${
                mode === key
                  ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#111]/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-zinc-400 leading-relaxed">
          {mode === "quick" && "Create an agent with default constraints. Recommended for standard automation tasks. You can adjust all settings and spending limits later in the agent dashboard."}
          {mode === "guided" && "Step-by-step wizard to configure your agent with custom constraints and settings."}
          {mode === "bulk" && "Create multiple agents at once with the same configuration."}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-[var(--cloak-error)]/10 border border-[var(--cloak-error)]/30 rounded-lg">
          <div className="flex items-center gap-3 text-[var(--cloak-error)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Quick Create Mode */}
      {mode === "quick" && (
        <div className="glass-card rounded-xl p-8 border border-[#1a1a1a] shadow-2xl shadow-black/50 animate-reveal">
          <div className="space-y-6">
            {/* Agent Name */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Agent Name</label>
              <input
                type="text"
                className="glass-input w-full rounded-lg px-4 py-3 text-[14px] placeholder-zinc-600 focus:ring-1 focus:ring-violet-500/50 transition-all"
                placeholder="e.g. Market Research Bot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Agent Icon */}
            <IconPicker value={selectedIcon} onChange={setSelectedIcon} />

            {/* Initial Funding */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Initial Funding</label>
              <div className="relative">
                <input
                  type="text"
                  className="glass-input w-full rounded-lg px-4 py-3 text-[14px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white"
                  value={fundingAmount}
                  onChange={(e) => setFundingAmount(e.target.value)}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 pointer-events-none">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] opacity-80" />
                  <span className="text-[12px] font-bold text-zinc-400 font-mono">SOL</span>
                </div>
              </div>
            </div>

            {/* Constraints */}
            <div className="bg-[#050505] border border-[#1a1a1a] rounded-lg p-5 mt-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Spending Constraints</span>
                </div>
                <span className="text-[10px] text-zinc-500">0 = unlimited</span>
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-[#1a1a1a] pt-4">
                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Max / Tx</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                      value={customConstraints.maxPerTx || formatSol(DEFAULT_CONSTRAINTS.maxPerTx)}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, maxPerTx: e.target.value })}
                      placeholder={formatSol(DEFAULT_CONSTRAINTS.maxPerTx)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Daily Limit</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                      value={customConstraints.dailyLimit || formatSol(DEFAULT_CONSTRAINTS.dailyLimit)}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, dailyLimit: e.target.value })}
                      placeholder={formatSol(DEFAULT_CONSTRAINTS.dailyLimit)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Total Limit</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                      value={customConstraints.totalLimit || formatSol(DEFAULT_CONSTRAINTS.totalLimit)}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, totalLimit: e.target.value })}
                      placeholder={formatSol(DEFAULT_CONSTRAINTS.totalLimit)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Private mode - fee breakdown with balance */}
            {privacyMode === "private" && (
              <div className="bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-lg p-4">
                {/* Privacy Cash Balance */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#8b5cf6]/10">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-[12px] font-medium text-zinc-300">Privacy Cash</span>
                  </div>
                  <span className="text-[13px] font-mono text-white">
                    {privacyCashReady && privacyCashBalance !== null
                      ? `${lamportsToSol(privacyCashBalance).toFixed(4)} SOL`
                      : "Not initialized"}
                  </span>
                </div>

                {/* Fee Breakdown */}
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Creation fee</span>
                    <span className="text-zinc-300 font-mono">{lamportsToSol(creationFee)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Vault funding</span>
                    <span className="text-zinc-300 font-mono">{parseFloat(fundingAmount) || 0} SOL</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#8b5cf6]/10">
                    <span className="font-medium text-[#8b5cf6]">Total required</span>
                    <span className="font-medium font-mono text-[#8b5cf6]">{lamportsToSol(totalDeposit)} SOL</span>
                  </div>
                </div>

                {/* Insufficient balance warning */}
                {privacyCashReady && privacyCashBalance !== null && totalDeposit > privacyCashBalance && (
                  <div className="mt-3 pt-3 border-t border-[#8b5cf6]/10 flex items-center gap-2 text-[11px] text-[var(--cloak-warning)]">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Insufficient balance. Need {lamportsToSol(totalDeposit - privacyCashBalance).toFixed(4)} more SOL</span>
                  </div>
                )}
              </div>
            )}

            {/* Create Button */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (privacyMode === "private" && !masterSecret) {
                    handleDeriveMasterSecret();
                  } else if (privacyMode === "private" && !privacyCashReady) {
                    initializePrivacyCash();
                  } else {
                    handleQuickCreate();
                  }
                }}
                disabled={creating || (privacyMode === "private" && privacyCashReady && privacyCashBalance !== null && totalDeposit > privacyCashBalance)}
                className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[13px] font-bold uppercase tracking-wide py-4 rounded-lg shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all transform active:scale-[0.99] mt-2 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : derivingSecret ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing...</span>
                  </>
                ) : privacyMode === "private" && !masterSecret ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Sign to Enable Cloaked</span>
                  </>
                ) : privacyMode === "private" && !privacyCashReady ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Initialize Privacy Cash</span>
                  </>
                ) : (
                  <>
                    <span>Create {privacyMode === "private" ? "Cloaked " : ""}Agent</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Guided Create Mode */}
        {mode === "guided" && (
          <GlassCard className="animate-reveal">
            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-6">
              {["name", "constraints", "funding", "review"].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step === s
                        ? "bg-[var(--cloak-violet)] text-white"
                        : ["name", "constraints", "funding", "review"].indexOf(step) > i
                        ? "bg-[var(--cloak-success)] text-white"
                        : "bg-[var(--cloak-surface)] text-[var(--cloak-text-muted)]"
                    }`}
                  >
                    {i + 1}
                  </div>
                  {i < 3 && (
                    <div className={`w-8 h-0.5 ${["name", "constraints", "funding", "review"].indexOf(step) > i ? "bg-[var(--cloak-success)]" : "bg-[var(--cloak-surface)]"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Name */}
            {step === "name" && (
              <>
                <h1 className="text-2xl font-bold mb-2">Name Your Agent</h1>
                <p className="text-[var(--cloak-text-muted)] mb-6">
                  Give your AI agent a memorable name.
                </p>

                <Input
                  label="Agent Name"
                  placeholder="e.g., Research Agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mb-6"
                />

                <div className="mb-6">
                  <IconPicker value={selectedIcon} onChange={setSelectedIcon} />
                </div>

                <Button
                  onClick={() => setStep("constraints")}
                  disabled={!name.trim()}
                  fullWidth
                >
                  Continue
                </Button>
              </>
            )}

            {/* Step 2: Constraints */}
            {step === "constraints" && (
              <>
                <h1 className="text-2xl font-bold mb-2">Set Constraints</h1>
                <p className="text-[var(--cloak-text-muted)] mb-6">
                  Choose spending limits for {name}.
                </p>

                <div className="space-y-3 mb-6">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedPreset(key)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        selectedPreset === key
                          ? "border-[var(--cloak-violet)] bg-[var(--cloak-violet)]/10"
                          : "border-[var(--cloak-glass-border)] hover:border-[var(--cloak-violet)]/50"
                      }`}
                    >
                      <div className="font-medium mb-1">{preset.name}</div>
                      <div className="text-sm text-[var(--cloak-text-muted)]">{preset.description}</div>
                      {preset.maxPerTx > 0 && (
                        <div className="text-xs text-[var(--cloak-text-muted)] mt-2">
                          {formatSol(preset.maxPerTx)}/tx · {formatSol(preset.dailyLimit)}/day · {formatSol(preset.totalLimit)} total
                        </div>
                      )}
                    </button>
                  ))}

                  <button
                    onClick={() => setSelectedPreset("custom")}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedPreset === "custom"
                        ? "border-[var(--cloak-violet)] bg-[var(--cloak-violet)]/10"
                        : "border-[var(--cloak-glass-border)] hover:border-[var(--cloak-violet)]/50"
                    }`}
                  >
                    <div className="font-medium mb-1">Custom</div>
                    <div className="text-sm text-[var(--cloak-text-muted)]">Set your own limits</div>
                  </button>
                </div>

                {selectedPreset === "custom" && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <Input
                      label="Max per transaction"
                      type="number"
                      step="0.01"
                      placeholder="0 = unlimited"
                      value={customConstraints.maxPerTx}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, maxPerTx: e.target.value })}
                      suffix="SOL"
                    />
                    <Input
                      label="Daily limit"
                      type="number"
                      step="0.1"
                      placeholder="0 = unlimited"
                      value={customConstraints.dailyLimit}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, dailyLimit: e.target.value })}
                      suffix="SOL"
                    />
                    <Input
                      label="Total limit"
                      type="number"
                      step="1"
                      placeholder="0 = unlimited"
                      value={customConstraints.totalLimit}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, totalLimit: e.target.value })}
                      suffix="SOL"
                    />
                    <Input
                      label="Expires in"
                      type="number"
                      step="1"
                      placeholder="0 = never"
                      value={customConstraints.expiresIn}
                      onChange={(e) => setCustomConstraints({ ...customConstraints, expiresIn: e.target.value })}
                      suffix="days"
                    />
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="secondary" onClick={() => setStep("name")} className="flex-1">
                    Back
                  </Button>
                  <Button onClick={() => setStep("funding")} className="flex-1">
                    Continue
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: Funding */}
            {step === "funding" && (
              <>
                <h1 className="text-[20px] font-bold text-white mb-2">Fund Your Agent</h1>
                <p className="text-[13px] text-zinc-400 mb-6">
                  How much SOL to deposit into {name}?
                </p>

                <div className="space-y-2 mb-6">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Initial Funding</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="glass-input w-full rounded-lg px-4 py-3 text-[14px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white"
                      value={fundingAmount}
                      onChange={(e) => setFundingAmount(e.target.value)}
                      placeholder="0.1"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 pointer-events-none">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] opacity-80" />
                      <span className="text-[12px] font-bold text-zinc-400 font-mono">SOL</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button variant="secondary" onClick={() => setStep("constraints")} className="flex-1">
                    Back
                  </Button>
                  <Button onClick={() => setStep("review")} className="flex-1">
                    Review
                  </Button>
                </div>
              </>
            )}

            {/* Step 4: Review */}
            {step === "review" && (
              <>
                <h1 className="text-[20px] font-bold text-white mb-2">Review & Create</h1>
                <p className="text-[13px] text-zinc-400 mb-6">
                  Confirm your agent settings.
                </p>

                <div className="bg-[#050505] border border-[#1a1a1a] rounded-lg p-5 mb-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] text-zinc-500 uppercase tracking-wide">Name</span>
                      <span className="text-[13px] font-medium text-white">{name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] text-zinc-500 uppercase tracking-wide">Funding</span>
                      <span className="text-[13px] font-mono text-white">{fundingAmount} SOL</span>
                    </div>
                    <div className="border-t border-[#1a1a1a] pt-3 mt-3">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Max / Tx</span>
                          <span className="block text-[13px] font-mono text-white">
                            {getConstraints().maxPerTx === 0 ? "∞" : `${formatSol(getConstraints().maxPerTx)}`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Daily</span>
                          <span className="block text-[13px] font-mono text-white">
                            {getConstraints().dailyLimit === 0 ? "∞" : `${formatSol(getConstraints().dailyLimit)}`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Total</span>
                          <span className="block text-[13px] font-mono text-white">
                            {getConstraints().totalLimit === 0 ? "∞" : `${formatSol(getConstraints().totalLimit)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Private mode fee breakdown */}
                {privacyMode === "private" && (
                  <div className="bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#8b5cf6]/10">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[12px] font-medium text-zinc-300">Privacy Cash</span>
                      </div>
                      <span className="text-[13px] font-mono text-white">
                        {privacyCashReady && privacyCashBalance !== null
                          ? `${lamportsToSol(privacyCashBalance).toFixed(4)} SOL`
                          : "Not initialized"}
                      </span>
                    </div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Creation fee</span>
                        <span className="text-zinc-300 font-mono">{lamportsToSol(creationFee)} SOL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Vault funding</span>
                        <span className="text-zinc-300 font-mono">{fundingAmount} SOL</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-[#8b5cf6]/10">
                        <span className="font-medium text-[#8b5cf6]">Total required</span>
                        <span className="font-medium font-mono text-[#8b5cf6]">{lamportsToSol(totalDeposit)} SOL</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="secondary" onClick={() => setStep("funding")} className="flex-1">
                    Back
                  </Button>
                  <button
                    onClick={() => {
                      if (privacyMode === "private" && !masterSecret) {
                        handleDeriveMasterSecret();
                      } else if (privacyMode === "private" && !privacyCashReady) {
                        initializePrivacyCash();
                      } else {
                        handleGuidedCreate();
                      }
                    }}
                    disabled={creating || (privacyMode === "private" && privacyCashReady && privacyCashBalance !== null && totalDeposit > privacyCashBalance)}
                    className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[13px] font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creating ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : derivingSecret ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Signing...</span>
                      </>
                    ) : privacyMode === "private" && !masterSecret ? (
                      <span>Sign to Enable</span>
                    ) : privacyMode === "private" && !privacyCashReady ? (
                      <span>Initialize Privacy Cash</span>
                    ) : (
                      <span>Create {privacyMode === "private" ? "Cloaked " : ""}Agent</span>
                    )}
                  </button>
                </div>
              </>
            )}
          </GlassCard>
        )}

        {/* Bulk Create Mode */}
        {mode === "bulk" && (
          <div className="glass-card rounded-xl p-8 border border-[#1a1a1a] shadow-2xl shadow-black/50 animate-reveal">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Number of Agents</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="glass-input w-full rounded-lg px-4 py-3 text-[14px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Name Template</label>
                  <input
                    type="text"
                    className="glass-input w-full rounded-lg px-4 py-3 text-[14px] placeholder-zinc-600 focus:ring-1 focus:ring-violet-500/50 transition-all"
                    placeholder="Agent"
                    value={bulkNameTemplate}
                    onChange={(e) => setBulkNameTemplate(e.target.value)}
                  />
                </div>
              </div>

              <div className="text-[12px] text-zinc-500 bg-[#050505] rounded-md px-3 py-2 border border-[#1a1a1a]">
                Will create: {bulkNameTemplate} #1, {bulkNameTemplate} #2, ... {bulkNameTemplate} #{bulkCount}
              </div>

              {/* Funding per Agent */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">Funding per Agent</label>
                <div className="relative">
                  <input
                    type="text"
                    className="glass-input w-full rounded-lg px-4 py-3 text-[14px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white"
                    value={fundingAmount}
                    onChange={(e) => setFundingAmount(e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 pointer-events-none">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] opacity-80" />
                    <span className="text-[12px] font-bold text-zinc-400 font-mono">SOL</span>
                  </div>
                </div>
              </div>

              {/* Constraints */}
              <div className="bg-[#050505] border border-[#1a1a1a] rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Spending Constraints (per agent)</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">0 = unlimited</span>
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-[#1a1a1a] pt-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Max / Tx</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                        value={customConstraints.maxPerTx || formatSol(DEFAULT_CONSTRAINTS.maxPerTx)}
                        onChange={(e) => setCustomConstraints({ ...customConstraints, maxPerTx: e.target.value })}
                        placeholder={formatSol(DEFAULT_CONSTRAINTS.maxPerTx)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Daily Limit</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                        value={customConstraints.dailyLimit || formatSol(DEFAULT_CONSTRAINTS.dailyLimit)}
                        onChange={(e) => setCustomConstraints({ ...customConstraints, dailyLimit: e.target.value })}
                        placeholder={formatSol(DEFAULT_CONSTRAINTS.dailyLimit)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-wider">Total Limit</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="glass-input w-full rounded-md px-3 py-2 text-[13px] font-mono focus:ring-1 focus:ring-violet-500/50 transition-all text-white pr-12"
                        value={customConstraints.totalLimit || formatSol(DEFAULT_CONSTRAINTS.totalLimit)}
                        onChange={(e) => setCustomConstraints({ ...customConstraints, totalLimit: e.target.value })}
                        placeholder={formatSol(DEFAULT_CONSTRAINTS.totalLimit)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">SOL</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Cost */}
              {privacyMode !== "private" && (
                <div className="bg-[#050505] border border-[#1a1a1a] rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-zinc-500">Total Cost ({bulkCount} agents)</span>
                    <span className="text-lg font-semibold font-mono text-[var(--cloak-cyan)]">
                      {(parseFloat(fundingAmount || "0") * parseInt(bulkCount || "0")).toFixed(2)} SOL
                    </span>
                  </div>
                </div>
              )}

              {/* Private mode - fee breakdown with balance */}
              {privacyMode === "private" && (
                <div className="bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-lg p-4">
                  {/* Privacy Cash Balance */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#8b5cf6]/10">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-[12px] font-medium text-zinc-300">Privacy Cash</span>
                    </div>
                    <span className="text-[13px] font-mono text-white">
                      {privacyCashReady && privacyCashBalance !== null
                        ? `${lamportsToSol(privacyCashBalance).toFixed(4)} SOL`
                        : "Not initialized"}
                    </span>
                  </div>

                  {/* Fee Breakdown */}
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Creation fee × {bulkCount}</span>
                      <span className="text-zinc-300 font-mono">{lamportsToSol(creationFee * parseInt(bulkCount || "1"))} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Vault funding × {bulkCount}</span>
                      <span className="text-zinc-300 font-mono">{((parseFloat(fundingAmount) || 0) * parseInt(bulkCount || "1")).toFixed(4)} SOL</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#8b5cf6]/10">
                      <span className="font-medium text-[#8b5cf6]">Total required</span>
                      <span className="font-medium font-mono text-[#8b5cf6]">{lamportsToSol(totalDeposit * parseInt(bulkCount || "1"))} SOL</span>
                    </div>
                  </div>

                  {/* Insufficient balance warning */}
                  {privacyCashReady && privacyCashBalance !== null && (totalDeposit * parseInt(bulkCount || "1")) > privacyCashBalance && (
                    <div className="mt-3 pt-3 border-t border-[#8b5cf6]/10 flex items-center gap-2 text-[11px] text-[var(--cloak-warning)]">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Insufficient balance. Need {lamportsToSol((totalDeposit * parseInt(bulkCount || "1")) - privacyCashBalance).toFixed(4)} more SOL</span>
                    </div>
                  )}
                </div>
              )}

              {/* Create Button */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (privacyMode === "private" && !masterSecret) {
                      handleDeriveMasterSecret();
                    } else if (privacyMode === "private" && !privacyCashReady) {
                      initializePrivacyCash();
                    } else {
                      handleBulkCreate();
                    }
                  }}
                  disabled={creating || (privacyMode === "private" && privacyCashReady && privacyCashBalance !== null && (totalDeposit * parseInt(bulkCount || "1")) > privacyCashBalance)}
                  className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[13px] font-bold uppercase tracking-wide py-4 rounded-lg shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all transform active:scale-[0.99] mt-2 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : derivingSecret ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing...</span>
                    </>
                  ) : privacyMode === "private" && !masterSecret ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Sign to Enable Cloaked</span>
                    </>
                  ) : privacyMode === "private" && !privacyCashReady ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Initialize Privacy Cash</span>
                    </>
                  ) : (
                    <>
                      <span>Create {bulkCount} {privacyMode === "private" ? "Cloaked " : ""}Agents</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default function CreateAgentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--cloak-violet)] border-t-transparent rounded-full" />
      </div>
    }>
      <CreateAgentContent />
    </Suspense>
  );
}
