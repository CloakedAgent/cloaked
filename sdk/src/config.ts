/**
 * SDK Configuration
 *
 * Centralized configuration for SDK modules.
 * Use setBackendUrl() to configure the backend URL at runtime,
 * which is required for browser environments where process.env
 * variables are not available.
 */

// Default backend URL - production API
const DEFAULT_BACKEND_URL = "https://api.cloakedagent.com";

// Runtime-configured backend URL
let _backendUrl: string | undefined;

/**
 * Get the configured backend URL
 *
 * Priority:
 * 1. Runtime-configured value (set via setBackendUrl)
 * 2. CLOAKED_BACKEND_URL environment variable (Node.js only)
 * 3. Default localhost URL
 *
 * Enforces HTTPS in production environments for non-localhost URLs.
 */
export function getBackendUrl(): string {
  let url: string;

  if (_backendUrl) {
    url = _backendUrl;
  } else if (typeof process !== "undefined" && process.env?.CLOAKED_BACKEND_URL) {
    url = process.env.CLOAKED_BACKEND_URL;
  } else {
    url = DEFAULT_BACKEND_URL;
  }

  // Enforce HTTPS in production for non-localhost URLs
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    if (url.startsWith("http://") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
      throw new Error("HTTPS required for backend communication in production");
    }
  }

  return url;
}

/**
 * Set the backend URL for all SDK modules
 *
 * MUST be called before using any SDK functions in browser environments.
 * In Next.js, call this once on app initialization with NEXT_PUBLIC_BACKEND_URL.
 *
 * @param url - The backend API URL (e.g., "https://api.cloakedagent.com")
 */
export function setBackendUrl(url: string): void {
  _backendUrl = url;
}

/**
 * Check if a custom backend URL has been configured
 */
export function isBackendUrlConfigured(): boolean {
  return _backendUrl !== undefined;
}
