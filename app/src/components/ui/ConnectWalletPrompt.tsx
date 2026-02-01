"use client";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { GlassCard } from "./GlassCard";
import { Button } from "./Button";

interface ConnectWalletPromptProps {
  title?: string;
  description?: string;
}

export function ConnectWalletPrompt({
  title = "Connect Wallet",
  description = "Connect your wallet to continue.",
}: ConnectWalletPromptProps) {
  const { setVisible } = useWalletModal();

  return (
    <div className="flex items-center justify-center h-full">
      <GlassCard className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cloak-violet)]/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[var(--cloak-violet)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2 text-[var(--cloak-text-primary)]">
          {title}
        </h2>
        <p className="text-[var(--cloak-text-muted)] mb-6">
          {description}
        </p>
        <Button onClick={() => setVisible(true)} fullWidth>
          Select Wallet
        </Button>
      </GlassCard>
    </div>
  );
}
