"use client";

import { FC, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const WALLET_BUTTON_STYLE = {
  background: "var(--cloak-surface)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  fontSize: "0.875rem",
  fontWeight: 500,
  height: "40px",
  padding: "0 16px",
} as const;

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header: FC<HeaderProps> = memo(function Header({ onMenuClick }) {
  const { connected } = useWallet();

  return (
    <header className="h-14 border-b border-[rgba(255,255,255,0.06)] bg-black flex-shrink-0 z-50">
      <div className="h-full px-4 md:px-6 flex items-center justify-between">
        {/* Left side: Menu button (mobile) + Logo + Nav */}
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="mobile-menu-btn"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/cloaked-logo.png"
              alt="Cloaked"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <span className="font-medium text-white text-base hidden sm:inline">Cloaked</span>
          </Link>
          <span className="text-zinc-600 hidden sm:inline">/</span>
          <Link
            href="/docs"
            className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:inline"
          >
            Docs
          </Link>
        </div>

        {/* Right side: Devnet badge + Wallet */}
        <div className="flex items-center gap-2 md:gap-3">
          <span className="px-2 py-1 text-xs font-medium rounded-md bg-[var(--cloak-success)]/10 text-[var(--cloak-success)] border border-[var(--cloak-success)]/20 hidden sm:inline">
            Devnet
          </span>
          <WalletMultiButton style={WALLET_BUTTON_STYLE} />
        </div>
      </div>
    </header>
  );
});
