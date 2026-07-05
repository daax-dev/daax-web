import { useEffect, useState } from "react";

/**
 * Client hook for server-resolved super-admin gating of the DB console (F6 — #102).
 *
 * Mirrors `use-admin-access.ts`: fetches `/api/admin/db/access`, whose
 * `{ superAdmin }` boolean is decided ENTIRELY on the server (env allow-list /
 * host-dev operator). The client only reflects that decision — it is never a
 * client-owned flag. Fails SAFE: `isSuperAdmin` stays `false` until resolved and
 * on any error, so the Data tab is never flashed to a non-super-admin.
 *
 * The endpoint is AUTHENTICATED-ONLY (not on the middleware public allowlist),
 * so an unauthenticated or unauthorized caller is denied by the default-deny
 * middleware / super-admin gate. A 401/403 is therefore the EXPECTED "no
 * super-admin access" answer — not an error — and is mapped to a cached,
 * authoritative no-access result rather than logged as a transient failure.
 */
export interface SuperAdminAccess {
  authenticated: boolean;
  superAdmin: boolean;
}

const EMPTY_ACCESS: SuperAdminAccess = {
  authenticated: false,
  superAdmin: false,
};

let cachedAccess: SuperAdminAccess | null = null;
let fetchPromise: Promise<SuperAdminAccess> | null = null;

export interface UseSuperAdminAccessResult {
  isSuperAdmin: boolean;
  loading: boolean;
}

export function useSuperAdminAccess(): UseSuperAdminAccessResult {
  const [access, setAccess] = useState<SuperAdminAccess | null>(cachedAccess);
  const [loading, setLoading] = useState(!cachedAccess);

  useEffect(() => {
    if (cachedAccess) return;

    if (!fetchPromise) {
      fetchPromise = fetch("/api/admin/db/access")
        .then(async (res) => {
          // 401/403 are the EXPECTED "not authenticated / not super-admin"
          // answers from the default-deny middleware + super-admin gate, not
          // error states: the caller simply has no super-admin access. Cache
          // the authoritative no-access result (do not retry, do not log).
          if (res.status === 401 || res.status === 403) {
            cachedAccess = EMPTY_ACCESS;
            return EMPTY_ACCESS;
          }
          if (!res.ok) throw new Error(`access: ${res.status}`);
          const data = (await res.json()) as SuperAdminAccess;
          cachedAccess = data;
          return data;
        })
        .catch((error) => {
          console.error("Error fetching super-admin access:", error);
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
    isSuperAdmin: access?.superAdmin ?? false,
    loading,
  };
}
