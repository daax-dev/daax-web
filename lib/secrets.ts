/**
 * Server-side secrets management for Daax
 * Stores sensitive credentials in a local JSON file (gitignored + dockerignored)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Secrets file location - in the process working directory (project root),
// gitignored and dockerignored so the plaintext credentials are never
// committed or baked into the image.
// NOTE: This path is ephemeral in container mode - it lives inside the
// container's writable layer and does NOT persist across redeploys. Provide
// credentials via env vars (GITHUB_TOKEN / GH_TOKEN) for durable config.
const SECRETS_FILE = join(process.cwd(), ".secrets.json");

export interface DaaxSecrets {
  // GitHub OAuth token (from App authorization)
  githubToken?: string;

  // GitHub App OAuth config
  githubAppClientId?: string;
  githubAppClientSecret?: string;
  githubAppCallbackUrl?: string; // Must match exactly what's in GitHub App settings
}

const DEFAULT_SECRETS: DaaxSecrets = {};

/**
 * Load secrets from disk
 */
export function getSecrets(): DaaxSecrets {
  try {
    if (existsSync(SECRETS_FILE)) {
      const content = readFileSync(SECRETS_FILE, "utf-8");
      return { ...DEFAULT_SECRETS, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error("Failed to read secrets:", error);
  }
  return DEFAULT_SECRETS;
}

/**
 * Save secrets to disk
 */
export function saveSecrets(secrets: Partial<DaaxSecrets>): DaaxSecrets {
  const current = getSecrets();
  const updated = { ...current, ...secrets };

  try {
    writeFileSync(SECRETS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save secrets:", error);
    throw error;
  }

  return updated;
}

/**
 * Get GitHub token - checks secrets file first, then env vars
 */
export function getGitHubToken(): string | null {
  const secrets = getSecrets();
  if (secrets.githubToken) {
    return secrets.githubToken;
  }
  // Fallback to environment variables
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

/**
 * Get masked version of a secret for display
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}
