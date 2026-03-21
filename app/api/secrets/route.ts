/**
 * Secrets API Route
 * Manages GitHub OAuth and credentials storage
 *
 * SECURITY: All endpoints require authentication via requireAuth()
 */

import { NextRequest, NextResponse } from "next/server";
import { getSecrets, saveSecrets } from "@/lib/secrets";
import {
  isGitHubAppConfigured,
  isGitHubAuthorized,
  getAuthorizationUrl,
  exchangeCodeForToken,
  verifyToken,
  getGitHubToken,
} from "@/lib/github-app";
import { requireAuth } from "@/lib/auth";

/**
 * GET - Get secrets status or start OAuth flow
 */
export async function GET(request: NextRequest) {
  // Require authentication for all secrets operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const action = request.nextUrl.searchParams.get("action");

  try {
    const secrets = getSecrets();

    // Start OAuth authorization
    if (action === "authorize") {
      if (!isGitHubAppConfigured()) {
        return NextResponse.json(
          {
            error: "GitHub App not configured. Set Client ID and Secret first.",
          },
          { status: 400 },
        );
      }

      if (!secrets.githubAppCallbackUrl) {
        return NextResponse.json(
          {
            error:
              "Callback URL not configured. Set the exact URL from your GitHub App settings.",
          },
          { status: 400 },
        );
      }

      // Generate state for CSRF protection
      const state = crypto.randomUUID();

      const authUrl = getAuthorizationUrl(state);

      return NextResponse.json({ authUrl, state });
    }

    // OAuth callback - exchange code for token
    if (action === "callback") {
      const code = request.nextUrl.searchParams.get("code");
      const error = request.nextUrl.searchParams.get("error");

      if (error) {
        // Redirect to settings with error
        return NextResponse.redirect(
          new URL(
            `/settings?github_error=${encodeURIComponent(error)}`,
            request.nextUrl.origin,
          ),
        );
      }

      if (!code) {
        return NextResponse.redirect(
          new URL(
            "/settings?github_error=No+code+received",
            request.nextUrl.origin,
          ),
        );
      }

      try {
        const token = await exchangeCodeForToken(code);

        // Verify token and get user info
        const user = await verifyToken(token);

        // Save the token
        saveSecrets({ githubToken: token });

        // Redirect to settings with success
        const successMsg = user ? `Connected+as+${user.login}` : "Connected";
        return NextResponse.redirect(
          new URL(
            `/settings?github_success=${successMsg}`,
            request.nextUrl.origin,
          ),
        );
      } catch (err) {
        return NextResponse.redirect(
          new URL(
            `/settings?github_error=${encodeURIComponent(String(err))}`,
            request.nextUrl.origin,
          ),
        );
      }
    }

    // Verify current token
    if (action === "verify") {
      const token = await getGitHubToken();
      if (!token) {
        return NextResponse.json({ valid: false, error: "No token" });
      }

      const user = await verifyToken(token);
      return NextResponse.json({
        valid: !!user,
        user,
      });
    }

    // Default: return status
    const appConfigured = isGitHubAppConfigured();
    const authorized = isGitHubAuthorized();

    // Get user info if we have a token
    let user = null;
    if (authorized) {
      const token = await getGitHubToken();
      if (token) {
        user = await verifyToken(token);
      }
    }

    return NextResponse.json({
      github: {
        appConfigured,
        clientId: secrets.githubAppClientId || null,
        callbackUrl: secrets.githubAppCallbackUrl || null,
        authorized,
        user,
        tokenSource: secrets.githubToken
          ? "oauth"
          : process.env.GITHUB_DAAX ||
              process.env.GITHUB_TOKEN ||
              process.env.GH_TOKEN
            ? "environment"
            : "none",
      },
    });
  } catch (error) {
    console.error("Secrets API error:", error);
    return NextResponse.json(
      { error: "Failed to get secrets status" },
      { status: 500 },
    );
  }
}

/**
 * POST - Save secrets
 */
export async function POST(request: NextRequest) {
  // Require authentication for all secrets operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    // Build updates object
    const updates: Record<string, string | undefined> = {};

    // GitHub App OAuth config
    if (body.githubAppClientId !== undefined) {
      updates.githubAppClientId = body.githubAppClientId || undefined;
    }
    if (body.githubAppClientSecret !== undefined) {
      updates.githubAppClientSecret = body.githubAppClientSecret || undefined;
    }
    if (body.githubAppCallbackUrl !== undefined) {
      updates.githubAppCallbackUrl = body.githubAppCallbackUrl || undefined;
    }

    // Direct token (for PAT fallback)
    if (body.githubToken !== undefined) {
      updates.githubToken = body.githubToken || undefined;
    }

    saveSecrets(updates);

    // Return updated status
    const secrets = getSecrets();
    const appConfigured = isGitHubAppConfigured();
    const authorized = isGitHubAuthorized();

    return NextResponse.json({
      success: true,
      github: {
        appConfigured,
        clientId: secrets.githubAppClientId || null,
        authorized,
      },
    });
  } catch (error) {
    console.error("Secrets save error:", error);
    return NextResponse.json(
      { error: "Failed to save secrets" },
      { status: 500 },
    );
  }
}

/**
 * DELETE - Disconnect GitHub (remove token)
 */
export async function DELETE() {
  // Require authentication for all secrets operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    saveSecrets({ githubToken: undefined });

    return NextResponse.json({
      success: true,
      message: "GitHub disconnected",
    });
  } catch (error) {
    console.error("Secrets delete error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }
}
