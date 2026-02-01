"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  PrivacyCashClient,
  InitializationStatus,
  initializePrivacyCash,
} from "@/lib/privacy-cash";
import { solToLamports } from "@/lib/cloaked";

const DEVNET_BALANCE_KEY = "cloak_devnet_balance";
const DEFAULT_DEVNET_BALANCE = 0.5 * 1e9; // 0.5 SOL in lamports

interface PrivacyCashContextState {
  client: PrivacyCashClient | null;
  status: InitializationStatus;
  error: string | null;
  balance: number | null; // in lamports (Privacy Cash or simulated)
  walletBalance: number | null; // in lamports (real wallet balance)
  balanceLoading: boolean;
  initialize: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  deposit: (solAmount: number) => Promise<string>;
  withdraw: (
    solAmount: number,
    recipientAddress: PublicKey
  ) => Promise<{ tx: string; netAmount: number; fee: number }>;
  fundTokenPda: (
    solAmount: number,
    pdaAddress: PublicKey
  ) => Promise<{ tx: string; amount: number }>;
}

const PrivacyCashContext = createContext<PrivacyCashContextState | null>(null);

// Simulate network delay (for devnet simulation)
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate simulated tx signature (for devnet simulation until real Privacy Cash is integrated)
function generateSimulatedTxSignature(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "sim_";
  for (let i = 0; i < 84; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function PrivacyCashProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [client, setClient] = useState<PrivacyCashClient | null>(null);
  const [status, setStatus] = useState<InitializationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Fetch wallet balance when connected
  useEffect(() => {
    async function fetchWalletBalance() {
      if (wallet.publicKey && connection) {
        try {
          const bal = await connection.getBalance(wallet.publicKey);
          setWalletBalance(bal);
        } catch {
          // Failed to fetch wallet balance
        }
      } else {
        setWalletBalance(null);
      }
    }
    fetchWalletBalance();
  }, [wallet.publicKey, connection]);

  // Reset state when wallet disconnects
  useEffect(() => {
    if (!wallet.connected) {
      setClient(null);
      setStatus("idle");
      setError(null);
      setBalance(null);
    }
  }, [wallet.connected]);

  // Get simulated balance from localStorage (devnet simulation until real Privacy Cash is integrated)
  const getSimulatedBalance = useCallback((): number => {
    if (typeof window === "undefined") return DEFAULT_DEVNET_BALANCE;
    const saved = localStorage.getItem(DEVNET_BALANCE_KEY);
    return saved ? parseFloat(saved) : DEFAULT_DEVNET_BALANCE;
  }, []);

  // Set simulated balance in localStorage
  const setSimulatedBalance = useCallback((lamports: number) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DEVNET_BALANCE_KEY, String(lamports));
    }
    setBalance(lamports);
  }, []);

  // Initialize Privacy Cash (devnet simulation until real integration)
  const initialize = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError("Please connect your wallet first");
      return;
    }

    // Devnet mode - simulated Privacy Cash initialization
    setStatus("awaiting-signature");
    await delay(500);
    setStatus("initializing");
    await delay(1000);
    setStatus("ready");
    setBalance(getSimulatedBalance());

    // Refresh wallet balance
    if (connection) {
      try {
        const bal = await connection.getBalance(wallet.publicKey);
        setWalletBalance(bal);
      } catch {
        // Failed to fetch wallet balance
      }
    }
  }, [wallet, getSimulatedBalance, connection]);

  // Refresh balance
  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true);

    // Refresh wallet balance
    if (wallet.publicKey && connection) {
      try {
        const bal = await connection.getBalance(wallet.publicKey);
        setWalletBalance(bal);
      } catch {
        // Failed to fetch wallet balance
      }
    }

    // Devnet simulation
    await delay(500);
    setBalance(getSimulatedBalance());
    setBalanceLoading(false);
  }, [getSimulatedBalance, wallet.publicKey, connection]);

  // Deposit (devnet simulation)
  const deposit = useCallback(
    async (solAmount: number): Promise<string> => {
      // Simulate deposit in devnet mode
      await delay(2000); // Simulate transaction time
      const currentBalance = getSimulatedBalance();
      const depositLamports = solToLamports(solAmount);
      setSimulatedBalance(currentBalance + depositLamports);
      return generateSimulatedTxSignature();
    },
    [getSimulatedBalance, setSimulatedBalance]
  );

  // Withdraw (devnet simulation)
  const withdraw = useCallback(
    async (solAmount: number, recipientAddress: PublicKey) => {
      // Simulate withdraw in devnet mode
      await delay(2000);
      const currentBalance = getSimulatedBalance();
      const withdrawLamports = solToLamports(solAmount);
      const fee = Math.floor(withdrawLamports * 0.0035); // ~0.35% Privacy Cash fee

      if (withdrawLamports > currentBalance) {
        throw new Error("Insufficient balance");
      }

      setSimulatedBalance(currentBalance - withdrawLamports);
      return {
        tx: generateSimulatedTxSignature(),
        netAmount: withdrawLamports - fee,
        fee: fee,
      };
    },
    [getSimulatedBalance, setSimulatedBalance]
  );

  // Fund token PDA with real SOL from wallet (devnet mode)
  const fundTokenPda = useCallback(
    async (solAmount: number, pdaAddress: PublicKey) => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }

      const lamports = solToLamports(solAmount);

      // Check wallet balance
      if (walletBalance !== null && lamports > walletBalance) {
        throw new Error("Insufficient wallet balance");
      }

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: pdaAddress,
          lamports,
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign and send
      const signed = await wallet.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(signed.serialize());

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, "confirmed");

      // Refresh wallet balance
      const newBal = await connection.getBalance(wallet.publicKey);
      setWalletBalance(newBal);

      // Also update simulated Privacy Cash balance (deduct same amount)
      const currentBalance = getSimulatedBalance();
      if (lamports <= currentBalance) {
        setSimulatedBalance(currentBalance - lamports);
      }

      return {
        tx: txSignature,
        amount: lamports,
      };
    },
    [wallet, connection, walletBalance, getSimulatedBalance, setSimulatedBalance]
  );

  return (
    <PrivacyCashContext.Provider
      value={{
        client,
        status,
        error,
        balance,
        walletBalance,
        balanceLoading,
        initialize,
        refreshBalance,
        deposit,
        withdraw,
        fundTokenPda,
      }}
    >
      {children}
    </PrivacyCashContext.Provider>
  );
}

export function usePrivacyCash() {
  const context = useContext(PrivacyCashContext);
  if (!context) {
    throw new Error("usePrivacyCash must be used within PrivacyCashProvider");
  }
  return context;
}
