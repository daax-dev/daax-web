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
 * super-admin access" answer — not an error — and is mapped to a no-access
 * result rather than logged as a transient failure.
 *
 * The resolved decision (positive OR the 401/403 no-access result) is cached
 * with a short TTL, not forever: an identity change or a newly-granted
 * super-admin becomes visible on the next mount after the TTL elapses, without
 * a hard reload, while unauthenticated callers keep failing safe to `false`. A
 * transient (500) failure is never cached, so it retries on the next mount.
 */
export interface SuperAdminAccess {
  authenticated: boolean;
  superAdmin: boolean;
}

const EMPTY_ACCESS: SuperAdminAccess = {
  authenticated: false,
  superAdmin: false,
};

/**
 * How long a resolved decision may be served before it is revalidated. Kept
 * short so a re-authentication or a role change surfaces quickly rather than
 * sticking until a hard reload.
 */
const CACHE_TTL_MS = 30_000;

let cachedAccess: SuperAdminAccess | null = null;
let cachedAt = 0;
let fetchPromise: Promise<SuperAdminAccess> | null = null;

function isCacheFresh(): boolean {
  return cachedAccess !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

export interface UseSuperAdminAccessResult {
  isSuperAdmin: boolean;
  loading: boolean;
}

export function useSuperAdminAccess(): UseSuperAdminAccessResult {
  const [access, setAccess] = useState<SuperAdminAccess | null>(() =>
    isCacheFresh() ? cachedAccess : null,
  );
  const [loading, setLoading] = useState(() => !isCacheFresh());

  useEffect(() => {
    let cancelled = false;

    if (isCacheFresh()) return;

    if (!fetchPromise) {
      fetchPromise = fetch("/api/admin/db/access")
        .then(async (res) => {
          // A redirected response means an upstream proxy / forward-auth sent
          // the unauthenticated caller to an HTML login page (fetch followed the
          // redirect, so res.redirected is true and the body is HTML, not JSON).
          // Like 401/403 this is the EXPECTED "no super-admin access" answer, not
          // an error: fail safe SILENTLY and TTL-cache it so it is not retried in
          // a tight loop or logged repeatedly.
          if (res.redirected) {
            cachedAccess = EMPTY_ACCESS;
            cachedAt = Date.now();
            return EMPTY_ACCESS;
          }
          // 401/403 are the EXPECTED "not authenticated / not super-admin"
          // answers from the default-deny middleware + super-admin gate, not
          // error states: the caller simply has no super-admin access. Cache
          // the no-access result with a TTL (do not log) so a later
          // re-authentication or role grant revalidates instead of sticking.
          if (res.status === 401 || res.status === 403) {
            cachedAccess = EMPTY_ACCESS;
            cachedAt = Date.now();
            return EMPTY_ACCESS;
          }
          // A genuine transient failure (e.g. 500) is a real error: rethrow so
          // it is logged and left uncached (retried on the next mount).
          if (!res.ok) throw new Error(`access: ${res.status}`);
          // A 200 whose body is not JSON (e.g. an HTML login page served via an
          // internal rewrite that did not mark the response redirected) makes
          // res.json() throw. That is another EXPECTED "no access" outcome, not a
          // transient error — fail safe SILENTLY and TTL-cache it rather than
          // logging and retrying.
          let data: SuperAdminAccess;
          try {
            data = (await res.json()) as SuperAdminAccess;
          } catch {
            cachedAccess = EMPTY_ACCESS;
            cachedAt = Date.now();
            return EMPTY_ACCESS;
          }
          cachedAccess = data;
          cachedAt = Date.now();
          return data;
        })
        .catch((error) => {
          console.error("Error fetching super-admin access:", error);
          // Transient failure: do not cache, so the next mount retries.
          return EMPTY_ACCESS;
        })
        .finally(() => {
          // Clear the in-flight promise so a later mount (after the TTL has
          // elapsed, or after a transient failure) starts a fresh request.
          fetchPromise = null;
        });
    }

    fetchPromise.then((data) => {
      // The in-flight promise may be shared across mounts and can settle after
      // THIS component unmounts. Skip the state update when cancelled so React
      // does not warn about setting state on an unmounted component (and tests
      // that unmount before resolve stay deterministic).
      if (cancelled) return;
      setAccess(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    isSuperAdmin: access?.superAdmin ?? false,
    loading,
  };
}
