import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Import the client-safe types/constants once, then re-export the same bindings
// so the public surface and internal use share a single source.
import type { AuthUser } from "./auth-types";
import { UNAUTHENTICATED_USER } from "./auth-types";

// Single source of truth for the forward-auth trust decision. The pure
// evaluator lives in ./auth-trust so the SAME logic backs both these
// request-scoped guards and the default-deny middleware (#181) — no drift.
import { deriveAuthContext, evaluateAuthDecision } from "./auth-trust";

export type { AuthUser };
export { UNAUTHENTICATED_USER };

/**
 * Result type for requireAuth() - either authenticated user or error response
 */
export type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; response: NextResponse };

export async function getAuthUser(): Promise<AuthUser> {
  const h = await headers();
  return deriveAuthContext(h).user;
}

/**
 * Authentication guard for API routes.
 *
 * Returns either the authenticated user or a 401 response ready to be returned
 * from your route handler. This allows routes to easily require authentication
 * while maintaining proper type narrowing.
 *
 * @example Basic usage - protect entire route
 * ```ts
 * import { requireAuth } from "@/lib/auth";
 *
 * export async function POST(request: NextRequest) {
 *   const auth = await requireAuth();
 *   if (!auth.authenticated) {
 *     return auth.response; // Returns 401 response
 *   }
 *
 *   // auth.user is now guaranteed to be authenticated
 *   console.log(`User ${auth.user.username} is making a request`);
 *
 *   // ... rest of your route logic
 * }
 * ```
 *
 * @example With group-based authorization
 * ```ts
 * export async function DELETE(request: NextRequest) {
 *   const auth = await requireAuth();
 *   if (!auth.authenticated) return auth.response;
 *
 *   // Additional authorization check
 *   if (!auth.user.groups.includes("admin")) {
 *     return NextResponse.json(
 *       { error: "Admin access required" },
 *       { status: 403 }
 *     );
 *   }
 *
 *   // ... admin-only logic
 * }
 * ```
 *
 * @returns AuthResult - either { authenticated: true, user: AuthUser } or { authenticated: false, response: NextResponse }
 */
export async function requireAuth(): Promise<AuthResult> {
  const h = await headers();
  const decision = evaluateAuthDecision(h);

  if (decision.decision === "deny") {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          error: "Authentication required",
          message: "You must be logged in to access this resource",
        },
        { status: 401 },
      ),
    };
  }

  return { authenticated: true, user: decision.user };
}

/**
 * Simple authentication check that throws if not authenticated.
 * Use this when you want to fail fast without handling the response yourself.
 *
 * @example
 * ```ts
 * import { requireAuthOrThrow } from "@/lib/auth";
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     const user = await requireAuthOrThrow();
 *     // user is guaranteed authenticated
 *   } catch (error) {
 *     // Handle in your error boundary or return 401
 *   }
 * }
 * ```
 *
 * @throws Error if user is not authenticated
 * @returns AuthUser - the authenticated user
 */
export async function requireAuthOrThrow(): Promise<AuthUser> {
  const h = await headers();
  const decision = evaluateAuthDecision(h);

  if (decision.decision === "deny") {
    throw new Error("Authentication required");
  }

  return decision.user;
}
