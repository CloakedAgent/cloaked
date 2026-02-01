/**
 * Poseidon hash wrapper for ZK secret derivation
 *
 * Uses circomlibjs for browser-compatible Poseidon hash matching
 * Noir's BN254 implementation.
 */

// circomlibjs types (declaration in circomlibjs.d.ts)
type PoseidonFn = (inputs: bigint[]) => Uint8Array;
type F = {
  e: (v: bigint) => bigint;
  toString: (v: Uint8Array) => string;
};
type PoseidonInstance = PoseidonFn & { F: F };

let poseidonInstance: PoseidonInstance | null = null;

/**
 * Initialize Poseidon hash function (lazy loaded)
 */
async function initPoseidon(): Promise<PoseidonInstance> {
  if (!poseidonInstance) {
    // Dynamic import for browser/node compatibility
    const circomlibjs = await import("circomlibjs");
    poseidonInstance = await circomlibjs.buildPoseidon() as PoseidonInstance;
  }
  return poseidonInstance!;
}

/**
 * Poseidon hash function compatible with Noir's BN254 implementation
 *
 * @param inputs - Array of bigint values to hash
 * @returns Hash result as bigint
 */
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const poseidon = await initPoseidon();
  const F = poseidon.F;
  const hash = poseidon(inputs.map((i) => F.e(i)));
  return BigInt(F.toString(hash));
}

// Synchronous version after initialization
let poseidonSync: ((inputs: bigint[]) => bigint) | null = null;

/**
 * Initialize synchronous Poseidon hash (call once at app start)
 * Required before using poseidonHash()
 */
export async function initPoseidonSync(): Promise<void> {
  const poseidonFn = await initPoseidon();
  const F = poseidonFn.F;
  poseidonSync = (inputs: bigint[]) => {
    const hash = poseidonFn(inputs.map((i) => F.e(i)));
    return BigInt(F.toString(hash));
  };
}

/**
 * Synchronous Poseidon hash (requires initPoseidonSync() first)
 *
 * @param inputs - Array of bigint values to hash
 * @returns Hash result as bigint
 * @throws Error if not initialized
 */
export function poseidonHash(inputs: bigint[]): bigint {
  if (!poseidonSync) {
    throw new Error("Poseidon not initialized. Call initPoseidonSync() first.");
  }
  return poseidonSync(inputs);
}

/**
 * Check if Poseidon is initialized for sync use
 */
export function isPoseidonReady(): boolean {
  return poseidonSync !== null;
}
