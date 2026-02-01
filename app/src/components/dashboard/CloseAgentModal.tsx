"use client";

import { useState, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { Button, Input } from "@/components/ui";

type Mode = "select" | "generated" | "custom";

interface CloseAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (destination: PublicKey) => Promise<void>;
  vaultBalance: number;
  isPrivate: boolean;
  connectedWallet: PublicKey;
}

export function CloseAgentModal({
  isOpen,
  onClose,
  onConfirm,
  vaultBalance,
  isPrivate,
  connectedWallet,
}: CloseAgentModalProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [generatedKeypair, setGeneratedKeypair] = useState<Keypair | null>(null);
  const [customAddress, setCustomAddress] = useState("");
  const [customAddressError, setCustomAddressError] = useState<string | null>(null);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setMode("select");
    setGeneratedKeypair(null);
    setCustomAddress("");
    setCustomAddressError(null);
    setHasCopiedKey(false);
    setShowPrivateKey(false);
    setIsClosing(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleGenerateKeypair = useCallback(() => {
    const keypair = Keypair.generate();
    setGeneratedKeypair(keypair);
    setMode("generated");
  }, []);

  const handleCopyPrivateKey = useCallback(async () => {
    if (!generatedKeypair) return;
    const privateKeyBase58 = bs58.encode(generatedKeypair.secretKey);
    await navigator.clipboard.writeText(privateKeyBase58);
    setHasCopiedKey(true);
  }, [generatedKeypair]);

  const handleCopyAddress = useCallback(async () => {
    if (!generatedKeypair) return;
    await navigator.clipboard.writeText(generatedKeypair.publicKey.toBase58());
  }, [generatedKeypair]);

  const validateCustomAddress = useCallback((address: string): PublicKey | null => {
    if (!address.trim()) {
      setCustomAddressError("Address is required");
      return null;
    }
    try {
      const pubkey = new PublicKey(address.trim());
      setCustomAddressError(null);
      return pubkey;
    } catch {
      setCustomAddressError("Invalid Solana address");
      return null;
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setError(null);
    setIsClosing(true);

    try {
      let destination: PublicKey;

      if (!isPrivate) {
        destination = connectedWallet;
      } else if (mode === "generated" && generatedKeypair) {
        destination = generatedKeypair.publicKey;
      } else if (mode === "custom") {
        const validated = validateCustomAddress(customAddress);
        if (!validated) {
          setIsClosing(false);
          return;
        }
        destination = validated;
      } else {
        setError("Please select a destination");
        setIsClosing(false);
        return;
      }

      await onConfirm(destination);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close agent");
      setIsClosing(false);
    }
  }, [isPrivate, mode, generatedKeypair, customAddress, connectedWallet, onConfirm, validateCustomAddress, handleClose]);

  const formatBalance = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (!isOpen) return null;

  const privateKeyBase58 = generatedKeypair ? bs58.encode(generatedKeypair.secretKey) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isClosing ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {isPrivate ? "Close Cloaked Agent" : "Close Agent"}
          </h2>
          <button
            onClick={handleClose}
            disabled={isClosing}
            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm">
            <p className="text-amber-200">
              This will permanently close the agent and return{" "}
              <span className="font-semibold">{formatBalance(vaultBalance)} SOL</span>{" "}
              to the destination address.
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {/* Standard Mode - Simple confirmation */}
        {!isPrivate && (
          <>
            <div className="mb-6">
              <p className="text-sm text-zinc-400 mb-3">Funds will be returned to your wallet:</p>
              <div className="p-3 rounded-lg bg-[#111] border border-[#1a1a1a] font-mono text-sm text-white">
                {connectedWallet.toBase58()}
              </div>
            </div>

            <p className="text-sm text-zinc-500 mb-6">This action cannot be undone.</p>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleClose} disabled={isClosing} fullWidth>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirm} loading={isClosing} fullWidth>
                Close Agent
              </Button>
            </div>
          </>
        )}

        {/* Private Mode - Destination Selection */}
        {isPrivate && mode === "select" && (
          <>
            <p className="text-sm text-zinc-400 mb-4">Where should the funds be sent?</p>

            {/* Option: Generate Fresh Wallet */}
            <button
              onClick={handleGenerateKeypair}
              className="w-full p-4 rounded-xl bg-[#111] border border-[#1a1a1a] hover:border-[#8b5cf6]/50 transition-all text-left mb-3 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#8b5cf6]/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-white group-hover:text-[#8b5cf6] transition-colors">
                    Generate fresh wallet
                    <span className="ml-2 text-xs font-normal text-[#8b5cf6]">Recommended</span>
                  </div>
                  <div className="text-sm text-zinc-500">Maximum privacy - no link to your wallet</div>
                </div>
              </div>
            </button>

            {/* Option: Custom Address */}
            <button
              onClick={() => setMode("custom")}
              className="w-full p-4 rounded-xl bg-[#111] border border-[#1a1a1a] hover:border-zinc-700 transition-all text-left mb-6 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-white group-hover:text-zinc-300 transition-colors">
                    Enter destination address
                  </div>
                  <div className="text-sm text-zinc-500">Send to any Solana address</div>
                </div>
              </div>
            </button>

            <Button variant="secondary" onClick={handleClose} fullWidth>
              Cancel
            </Button>
          </>
        )}

        {/* Private Mode - Generated Keypair */}
        {isPrivate && mode === "generated" && generatedKeypair && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-green-500">Fresh wallet generated</span>
            </div>

            {/* Address */}
            <div className="mb-4">
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-2">Address</label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#111] border border-[#1a1a1a]">
                <span className="font-mono text-sm text-white flex-1 truncate">
                  {generatedKeypair.publicKey.toBase58()}
                </span>
                <button
                  onClick={handleCopyAddress}
                  className="text-zinc-500 hover:text-white transition-colors"
                  title="Copy address"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Private Key */}
            <div className="mb-4">
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-2">Private Key</label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#111] border border-[#1a1a1a]">
                <span className="font-mono text-sm text-white flex-1 truncate">
                  {showPrivateKey ? privateKeyBase58 : "•".repeat(44)}
                </span>
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-zinc-500 hover:text-white transition-colors"
                  title={showPrivateKey ? "Hide" : "Show"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {showPrivateKey ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
                <button
                  onClick={handleCopyPrivateKey}
                  className={`transition-colors ${hasCopiedKey ? "text-green-500" : "text-zinc-500 hover:text-white"}`}
                  title="Copy private key"
                >
                  {hasCopiedKey ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-200">
                Save this private key! It will not be shown again.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode("select");
                  setGeneratedKeypair(null);
                  setHasCopiedKey(false);
                  setShowPrivateKey(false);
                }}
                disabled={isClosing}
              >
                Back
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
                loading={isClosing}
                disabled={!hasCopiedKey}
                fullWidth
                title={!hasCopiedKey ? "Copy the private key first" : undefined}
              >
                Close Agent
              </Button>
            </div>

            {!hasCopiedKey && (
              <p className="text-xs text-zinc-500 text-center mt-3">
                Copy the private key to enable closing
              </p>
            )}
          </>
        )}

        {/* Private Mode - Custom Address */}
        {isPrivate && mode === "custom" && (
          <>
            <div className="mb-4">
              <Input
                label="Destination Address"
                placeholder="Enter Solana address..."
                value={customAddress}
                onChange={(e) => {
                  setCustomAddress(e.target.value);
                  setCustomAddressError(null);
                }}
                error={customAddressError || undefined}
              />
            </div>

            {/* Privacy Warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-200">
                Using your main wallet will create an on-chain link, reducing privacy.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode("select");
                  setCustomAddress("");
                  setCustomAddressError(null);
                }}
                disabled={isClosing}
              >
                Back
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
                loading={isClosing}
                disabled={!customAddress.trim()}
                fullWidth
              >
                Close Agent
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
