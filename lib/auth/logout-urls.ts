/**
 * Logout URL derivation for the two-step daax logout.
 *
 * The fleet gates daax with traefik-forward-auth v4.14.1 against each host's
 * OWN Pocket ID v2.14.0 (`auth.<host>.poley.dev`). `NEXT_PUBLIC_*` values are
 * inlined at build time, and one image is deployed to every host, so the
 * per-host URLs are derived at runtime from `window.location`.
 *
 * Upstream contracts (verified against the tagged source):
 * - traefik-forward-auth v4.14.1 registers the portal logout as
 *   `POST /portals/:portal/logout` only (pkg/server/server.go:220). The handler
 *   deletes the session + state cookies and answers 303 to the portal page
 *   (pkg/server/routes-auth.go:401-418). A GET matches no route.
 * - Pocket ID v2.14.0 serves `GET|POST /api/oidc/end-session`
 *   (backend/internal/oidc/module.go:160-161), but without `id_token_hint` it
 *   fails (end_session_service.go:37-38) and redirects to `/logout`
 *   (end_session_handler.go:32-35) without clearing its cookie and ignoring
 *   `post_logout_redirect_uri`. daax never holds an ID token (forward-auth
 *   keeps only its own session JWT), so on the fleet the browser goes straight
 *   to Pocket ID's `/logout` sign-out page — the same destination, without the
 *   failing hop.
 */

/** Same-origin forward-auth portal logout (portal `main`). */
export const DEFAULT_FORWARD_AUTH_LOGOUT_URL = "/portals/main/logout";

/** Legacy non-fleet default, kept for localhost and other hosts. */
export const DEFAULT_OIDC_END_SESSION_URL =
  "https://auth.poley.dev/api/oidc/end-session";

/** Pocket ID v2.14.0 sign-out confirmation page path. */
export const POCKET_ID_LOGOUT_PATH = "/logout";

/**
 * Exactly `daax.<one DNS label>.poley.dev`. Anchored and single-label, so
 * `daax.kinsale.poley.dev.evil.com`, `daax.a.b.poley.dev` and
 * `xdaax.kinsale.poley.dev` do not match.
 */
const FLEET_DAAX_HOSTNAME =
  /^daax\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.poley\.dev$/;

export interface LogoutLocation {
  hostname: string;
  origin: string;
}

export interface LogoutEnv {
  /** `NEXT_PUBLIC_LOGOUT_URL`; empty/undefined means unset. */
  logoutUrl?: string;
  /** `NEXT_PUBLIC_OIDC_END_SESSION_URL`; empty/undefined means unset. */
  endSessionUrl?: string;
}

export interface LogoutUrls {
  /** URL to POST to so forward-auth clears its session cookie. */
  forwardAuthLogoutUrl: string;
  /** URL to navigate the top-level window to so the IdP session ends. */
  identityProviderLogoutUrl: string;
}

/** Returns the fleet host label for `daax.<host>.poley.dev`, else null. */
export function fleetHostFromHostname(hostname: string): string | null {
  const match = FLEET_DAAX_HOSTNAME.exec(hostname);
  return match ? match[1] : null;
}

function legacyEndSessionUrl(endSessionUrl: string, origin: string): string {
  return `${endSessionUrl}?post_logout_redirect_uri=${encodeURIComponent(origin)}`;
}

export function deriveLogoutUrls(
  location: LogoutLocation,
  env: LogoutEnv = {},
): LogoutUrls {
  const forwardAuthLogoutUrl = env.logoutUrl || DEFAULT_FORWARD_AUTH_LOGOUT_URL;

  if (env.endSessionUrl) {
    return {
      forwardAuthLogoutUrl,
      identityProviderLogoutUrl: legacyEndSessionUrl(
        env.endSessionUrl,
        location.origin,
      ),
    };
  }

  const host = fleetHostFromHostname(location.hostname);
  if (host) {
    return {
      forwardAuthLogoutUrl,
      identityProviderLogoutUrl: `https://auth.${host}.poley.dev${POCKET_ID_LOGOUT_PATH}`,
    };
  }

  return {
    forwardAuthLogoutUrl,
    identityProviderLogoutUrl: legacyEndSessionUrl(
      DEFAULT_OIDC_END_SESSION_URL,
      location.origin,
    ),
  };
}
