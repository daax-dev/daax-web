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
 * error, so the admin surface is never flashed to a non-admin. Mirrors the
 * shared-cache pattern of `use-auth-user.ts`.
 */
export interface AdminAccess {
  authenticated: boolean;
  isAdmin: boolean;
  permissions: Permission[];
}

const EMPTY_ACCESS: AdminAccess = {
  authenticated: false,
  isAdmin: false,
  permissions: [],
};

let cachedAccess: AdminAccess | null = null;
let fetchPromise: Promise<AdminAccess> | null = null;

export interface UseAdminAccessResult {
  isAdmin: boolean;
  permissions: Permission[];
  loading: boolean;
}

export function useAdminAccess(): UseAdminAccessResult {
  const [access, setAccess] = useState<AdminAccess | null>(cachedAccess);
  const [loading, setLoading] = useState(!cachedAccess);

  useEffect(() => {
    if (cachedAccess) return;

    if (!fetchPromise) {
      fetchPromise = fetch("/api/auth/access")
        .then((res) => {
          if (!res.ok) throw new Error(`access: ${res.status}`);
          return res.json();
        })
        .then((data: AdminAccess) => {
          cachedAccess = data;
          return data;
        })
        .catch((error) => {
          console.error("Error fetching admin access:", error);
          fetchPromise = null; // allow transient failures to retry
          return EMPTY_ACCESS;
        });
    }

    fetchPromise.then((data) => {
      setAccess(data);
      setLoading(false);
    });
  }, []);

  return {
    isAdmin: access?.isAdmin ?? false,
    permissions: access?.permissions ?? [],
    loading,
  };
}
