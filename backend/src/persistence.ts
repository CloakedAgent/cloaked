/**
 * Persistence module for backend state
 *
 * Stores used deposit signatures in JSON file to survive server restarts.
 * Rate limits are kept in-memory only (short-lived, not critical).
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const SIGNATURES_FILE = path.join(DATA_DIR, "used-signatures.json");

// In-memory cache (loaded from disk on startup)
let usedSignatures: Set<string> = new Set();

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Atomic write: write to temp file then rename
 */
function atomicWrite(filePath: string, data: string): void {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, data, "utf-8");
  fs.renameSync(tempPath, filePath);
}

// ============================================
// Used Signatures (Replay Protection)
// ============================================

/**
 * Load used signatures from disk
 */
export function loadUsedSignatures(): void {
  ensureDataDir();
  try {
    if (fs.existsSync(SIGNATURES_FILE)) {
      const data = fs.readFileSync(SIGNATURES_FILE, "utf-8");
      const signatures: string[] = JSON.parse(data);
      usedSignatures = new Set(signatures);
    }
  } catch (error) {
    console.error("[persistence] Error loading signatures, starting fresh:", error);
    usedSignatures = new Set();
  }
}

/**
 * Save used signatures to disk
 */
function saveUsedSignatures(): void {
  ensureDataDir();
  const data = JSON.stringify(Array.from(usedSignatures));
  atomicWrite(SIGNATURES_FILE, data);
}

/**
 * Check if a signature has been used
 */
export function hasSignature(signature: string): boolean {
  return usedSignatures.has(signature);
}

/**
 * Add a signature to the used set and persist
 */
export function addSignature(signature: string): void {
  usedSignatures.add(signature);
  saveUsedSignatures();
}

/**
 * Remove a signature from the used set (for rollback on failure)
 */
export function removeSignature(signature: string): void {
  usedSignatures.delete(signature);
  saveUsedSignatures();
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize persistence - load data from disk
 */
export function initPersistence(): void {
  loadUsedSignatures();
}
