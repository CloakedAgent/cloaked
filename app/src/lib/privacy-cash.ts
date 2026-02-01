import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import {
  RPC_URL,
  PRIVACY_CASH_KEY_BASE_PATH,
  PRIVACY_CASH_SIGN_MESSAGE,
} from "./constants";

export type InitializationStatus =
  | "idle"
  | "awaiting-signature"
  | "initializing"
  | "ready"
  | "error";

export interface PrivacyCashClient {
  deposit: (lamports: number) => Promise<{ tx: string }>;
  withdraw: (
    lamports: number,
    recipientAddress: PublicKey
  ) => Promise<{
    tx: string;
    amount_in_lamports: number;
    fee_in_lamports: number;
  }>;
  getPrivateBalance: () => Promise<number>;
  isInitialized: boolean;
}

interface InitializedState {
  connection: Connection;
  publicKey: PublicKey;
  encryptionService: any;
  lightWasm: any;
  signTransaction: NonNullable<WalletContextState["signTransaction"]>;
}

/**
 * Dynamically import Privacy Cash SDK modules (browser-only)
 */
async function loadPrivacyCashModules() {
  // Dynamic import to avoid SSR issues with WASM
  const [hasherModule, pcUtils] = await Promise.all([
    import("@lightprotocol/hasher.rs"),
    import("privacycash/utils"),
  ]);

  return {
    WasmFactory: hasherModule.WasmFactory,
    deposit: pcUtils.deposit,
    withdraw: pcUtils.withdraw,
    getUtxos: pcUtils.getUtxos,
    getBalanceFromUtxos: pcUtils.getBalanceFromUtxos,
    EncryptionService: pcUtils.EncryptionService,
  };
}

/**
 * Initialize Privacy Cash client with wallet adapter
 *
 * Flow:
 * 1. Request wallet signature for encryption key derivation
 * 2. Initialize Light Protocol WASM
 * 3. Create encryption service with derived keys
 * 4. Return client interface
 */
export async function initializePrivacyCash(
  wallet: WalletContextState,
  onStatusChange?: (status: InitializationStatus) => void
): Promise<PrivacyCashClient> {
  if (typeof window === "undefined") {
    throw new Error("Privacy Cash can only be initialized in browser");
  }

  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  if (!wallet.signMessage) {
    throw new Error("Wallet does not support message signing");
  }

  if (!wallet.signTransaction) {
    throw new Error("Wallet does not support transaction signing");
  }

  // Step 1: Request signature for encryption key derivation
  onStatusChange?.("awaiting-signature");

  const message = new TextEncoder().encode(PRIVACY_CASH_SIGN_MESSAGE);
  let signature: Uint8Array;

  try {
    const signatureResponse = await wallet.signMessage(message);
    signature =
      signatureResponse instanceof Uint8Array
        ? signatureResponse
        : (signatureResponse as { signature: Uint8Array }).signature;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("reject")
    ) {
      throw new Error("Signature required to access Privacy Cash");
    }
    throw error;
  }

  // Step 2: Load modules and initialize WASM
  onStatusChange?.("initializing");

  const { WasmFactory, deposit, withdraw, getUtxos, getBalanceFromUtxos, EncryptionService } =
    await loadPrivacyCashModules();

  const lightWasm = await WasmFactory.getInstance();

  const encryptionService = new EncryptionService();
  encryptionService.deriveEncryptionKeyFromSignature(signature);

  // Create connection
  const connection = new Connection(RPC_URL, "confirmed");

  // Store state for client methods
  const state: InitializedState = {
    connection,
    publicKey: wallet.publicKey,
    encryptionService,
    lightWasm,
    signTransaction: wallet.signTransaction,
  };

  onStatusChange?.("ready");

  return createClient(state, { deposit, withdraw, getUtxos, getBalanceFromUtxos });
}

function createClient(
  state: InitializedState,
  modules: {
    deposit: any;
    withdraw: any;
    getUtxos: any;
    getBalanceFromUtxos: any;
  }
): PrivacyCashClient {
  const { connection, publicKey, encryptionService, lightWasm, signTransaction } = state;
  const { deposit: pcDeposit, withdraw: pcWithdraw, getUtxos, getBalanceFromUtxos } = modules;

  return {
    isInitialized: true,

    async deposit(lamports: number) {
      const result = await pcDeposit({
        lightWasm,
        storage: localStorage,
        keyBasePath: PRIVACY_CASH_KEY_BASE_PATH,
        publicKey,
        connection,
        amount_in_lamports: lamports,
        encryptionService,
        transactionSigner: async (tx: VersionedTransaction) => {
          return await signTransaction(tx);
        },
      });

      return { tx: result.tx };
    },

    async withdraw(lamports: number, recipientAddress: PublicKey) {
      const result = await pcWithdraw({
        lightWasm,
        storage: localStorage,
        keyBasePath: PRIVACY_CASH_KEY_BASE_PATH,
        publicKey,
        connection,
        amount_in_lamports: lamports,
        encryptionService,
        recipient: recipientAddress,
      });

      return {
        tx: result.tx,
        amount_in_lamports: result.amount_in_lamports,
        fee_in_lamports: result.fee_in_lamports,
      };
    },

    async getPrivateBalance() {
      const utxos = await getUtxos({
        publicKey,
        connection,
        encryptionService,
        storage: localStorage,
      });

      const { lamports } = getBalanceFromUtxos(utxos);
      return lamports;
    },
  };
}
