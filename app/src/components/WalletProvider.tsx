"use client";

import { FC, ReactNode, useMemo, createContext, useContext, useState, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { setBackendUrl } from "@cloakedagent/sdk";
import { BACKEND_URL, RPC_URL } from "@/lib/constants";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

// Initialize SDK backend URL for browser environment
setBackendUrl(BACKEND_URL);

// Context to track if wallet has finished initializing
const WalletReadyContext = createContext<boolean>(false);

export const useWalletReady = () => useContext(WalletReadyContext);

// Inner component that tracks wallet initialization
const WalletReadyProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { wallet, connecting } = useWallet();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check localStorage for previously connected wallet
    const hasStoredWallet = localStorage.getItem("walletName") !== null;

    // If no stored wallet, we're ready immediately
    if (!hasStoredWallet) {
      setReady(true);
      return;
    }

    // If there's a stored wallet, wait for connection attempt to complete
    // Ready when: not connecting AND (connected OR no wallet selected)
    if (!connecting) {
      // Small delay to ensure wallet adapter has finished
      const timer = setTimeout(() => setReady(true), 500);
      return () => clearTimeout(timer);
    }
  }, [wallet, connecting]);

  return (
    <WalletReadyContext.Provider value={ready}>
      {children}
    </WalletReadyContext.Provider>
  );
};

interface Props {
  children: ReactNode;
}

export const WalletProvider: FC<Props> = ({ children }) => {
  // Use RPC_URL from env (defaults to public devnet)
  const endpoint = useMemo(() => RPC_URL, []);

  // Wallets will auto-detect installed wallet extensions
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletReadyProvider>{children}</WalletReadyProvider>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
