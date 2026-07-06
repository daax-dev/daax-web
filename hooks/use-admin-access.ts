import { useEffect, useState } from "react";
import type { Permission } from "@/lib/rbac/permissions";

/**
 * Client hook for server-resolved privileged-UI gating (F5 — issue #101).
 *
 * Replaces the build-time `NEXT_PUBLIC_ADMIN_MODE` boolean: admin visibility now
 * comes from `/api/auth/access`, which resolves the caller's roles server-side
 * (docs §3 F5), so UI visibility and API authorization can never diverge.
 *
 * Fails SAFE: `isAdmin` defaults to `false` until the fetch resolves and on any
 * error (including a 401/403), so the admin surface is never flashed to a
 * non-admin.
 *
 * REVALIDATION (TTL): the resolved access is cached only for `ACCESS_TTL_MS` and
 * stamped with `cachedAt`. A mount past the TTL refetches, so a role change (or
 * an identity switch after re-auth) is picked up instead of the UI showing a
 * stale admin surface for the JS-runtime lifetime. The in-flight promise is
 * cleared on `.finally`, so the FIRST mount past the TTL always starts a fresh
 * fetch (a failed fetch likewise leaves nothing cached, so it retries).
 */
export interface AdminAccess {
  authenticated: boolean;
  isAdmin: boolean;
  permissions: Permission[];
}

/** How long a resolved access summary is trusted before a mount revalidates. */
export const ACCESS_TTL_MS = 30_000;

const EMPTY_ACCESS: AdminAccess = {
  authenticated: false,
  isAdmin: false,
  permissions: [],
};

let cachedAccess: AdminAccess | null = null;
let cachedAt = 0;
let fetchPromise: Promise<AdminAccess> | null = null;

/** True when a successfully-resolved access summary is still within its TTL. */
function isFresh(): boolean {
  return cachedAccess !== null && Date.now() - cachedAt < ACCESS_TTL_MS;
}

export interface UseAdminAccessResult {
  isAdmin: boolean;
  permissions: Permission[];
  loading: boolean;
}

export function useAdminAccess(): UseAdminAccessResult {
  const [access, setAccess] = useState<AdminAccess | null>(
    isFresh() ? cachedAccess : null,
  );
  const [loading, setLoading] = useState(!isFresh());

  useEffect(() => {
    let cancelled = false;

    // Serve a still-fresh cached summary without a network round-trip.
    if (isFresh()) {
      setAccess(cachedAccess);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetch("/api/auth/access")
        .then((res) => {
          // 401/403 → definitively "no access" (fail SAFE, not an error). Not
          // cached, so a later re-auth revalidates on the next mount.
          if (res.status === 401 || res.status === 403) return EMPTY_ACCESS;
          if (!res.ok) throw new Error(`access: ${res.status}`);
          return res.json() as Promise<AdminAccess>;
        })
        .then((data: AdminAccess) => {
          // Only a real, authorized summary is cached (with its timestamp) so
          // the TTL governs revalidation. EMPTY_ACCESS from a 401/403 is passed
          // through below but intentionally NOT cached.
          if (data !== EMPTY_ACCESS) {
            cachedAccess = data;
            cachedAt = Date.now();
          }
          return data;
        })
        .catch((error) => {
          console.error("Error fetching admin access:", error);
          return EMPTY_ACCESS;
        })
        .finally(() => {
          // Clear the in-flight promise so a remount past the TTL (or after a
          // transient failure) starts a fresh fetch instead of reusing a
          // settled one.
          fetchPromise = null;
        });
    }

    fetchPromise.then((data) => {
      if (cancelled) return;
      setAccess(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    isAdmin: access?.isAdmin ?? false,
    permissions: access?.permissions ?? [],
    loading,
  };
}
