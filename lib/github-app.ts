/**
 * GitHub App OAuth Authentication
 *
 * Uses GitHub App OAuth flow for user authorization.
 * User authorizes via browser, we get an access token.
 */

import { getSecrets } from "./secrets";

/**
 * Get GitHub OAuth config from secrets
 */
export function getGitHubAppConfig(): {
  clientId: string;
  clientSecret: string;
  callbackUrl?: string;
} | null {
  const secrets = getSecrets();

  if (!secrets.githubAppClientId || !secrets.githubAppClientSecret) {
    return null;
  }

  return {
    clientId: secrets.githubAppClientId,
    clientSecret: secrets.githubAppClientSecret,
    callbackUrl: secrets.githubAppCallbackUrl,
  };
}

/**
 * Get the OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const config = getGitHubAppConfig();
  if (!config) {
    throw new Error("GitHub App not configured");
  }

  if (!config.callbackUrl) {
    throw new Error("Callback URL not configured");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "repo", // Access to repositories
    state,
  });

  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const config = getGitHubAppConfig();
  if (!config) {
    throw new Error("GitHub App not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange code: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data.access_token;
}

/**
 * Get a valid GitHub token for API calls
 * Returns the stored OAuth token or falls back to env vars
 */
export async function getGitHubToken(): Promise<string | null> {
  const secrets = getSecrets();

  // Check for OAuth token first
  if (secrets.githubToken) {
    return secrets.githubToken;
  }

  // Fallback to environment variables
  return (
    process.env.GITHUB_DAAX ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    null
  );
}

/**
 * Check if GitHub App OAuth is configured (has client credentials)
 */
export function isGitHubAppConfigured(): boolean {
  const config = getGitHubAppConfig();
  return !!(config?.clientId && config?.clientSecret);
}

/**
 * Check if user has authorized (has access token)
 */
export function isGitHubAuthorized(): boolean {
  const secrets = getSecrets();
  return !!(
    secrets.githubToken ||
    process.env.GITHUB_DAAX ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN
  );
}

/**
 * Verify the token works by fetching user info
 */
export async function verifyToken(
  token: string,
): Promise<{ login: string; name: string | null } | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      login: data.login,
      name: data.name,
    };
  } catch {
    return null;
  }
}
