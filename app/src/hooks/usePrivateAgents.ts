"use client";

import { usePrivateMaster, PrivateAgent } from "@/contexts/PrivateMasterContext";

// Re-export PrivateAgent type for convenience
export type { PrivateAgent };

/**
 * Hook for accessing private agents from the centralized context.
 * Both sidebar and dashboard will receive the same state.
 */
export function usePrivateAgents() {
  const {
    privateAgents: agents,
    privateLoading: loading,
    privateError: error,
    hasMasterSecret,
    getMasterSecret,
    isSignatureRequested,
    deriveMaster,
    refreshPrivateAgents: refresh,
  } = usePrivateMaster();

  return {
    agents,
    loading,
    error,
    /** Quick check if master secret is available */
    hasMasterSecret,
    /** Get the decrypted master secret (async) - use for CloakedAgent operations */
    getMasterSecret,
    isSignatureRequested,
    deriveMaster,
    refresh,
  };
}
