/**
 * Origin allowlist (issue #181).
 *
 * Pure, dependency-free Origin/CSRF allowlist. Extracted from
 * `server/config/constants.ts` so it can be imported by `middleware.ts` WITHOUT
 * pulling the terminal-server constants (os/path/homedir, container image names,
 * recording paths) into the middleware bundle — the middleware runs on every
 * /api request, so its bundle must stay minimal.
 *
 * `server/config/constants.ts` re-exports `isAllowedOrigin` from here so existing
 * importers (e.g. `server/handlers/ws-auth.ts`) keep working unchanged. The
 * allowlist behavior is intentionally identical to the previous inline version.
 */

/**
 * Helper to validate port number is in valid range (1-65535)
 */
function isValidPort(portStr: string | undefined): boolean {
  if (!portStr) return true; // No port is valid (uses default)
  const port = parseInt(portStr, 10);
  return !isNaN(port) && port >= 1 && port <= 65535;
}

/**
 * Check if an origin is allowed (localhost, Tailscale IPs, production domains)
 * When running in container, the external port may differ from internal port
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // Reject a missing/empty Origin (F1b, issue #95). Browsers always send Origin
  // on a WS upgrade, so an absent Origin means a non-browser/raw client, which
  // must not be admitted on origin alone.
  if (!origin) return false;

  // Extract port from origin for validation
  const portMatch = origin.match(/:(\d+)$/);
  const port = portMatch?.[1];
  if (!isValidPort(port)) return false;

  // Allow any localhost origin (different ports for container mapping)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  // Allow Traefik local hostnames (*.localhost, e.g. http://daax.localhost).
  // The `.localhost` TLD is reserved to loopback (RFC 6761), so any host ending
  // in `.localhost` resolves to the local machine — safe to allow for local
  // reverse-proxy access (this is the default `docker compose up` workflow).
  if (/^https?:\/\/([a-z0-9-]+\.)+localhost(:\d+)?$/.test(origin)) return true;

  // Allow Tailscale IPs (100.64.0.0/10 = 100.64.0.0 – 100.127.255.255)
  // This is the CGNAT range used by Tailscale, not the full 100/8 block
  // Octets 3 & 4 are validated to 0-255 range
  if (
    /^https?:\/\/100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(:\d{1,5})?$/.test(
      origin,
    )
  )
    return true;

  // Allow production domains (daax.HOSTNAME.poley.dev)
  // This regex matches the Origin header (scheme + host), not full URLs with paths
  // Optional :443 port for robustness when explicitly specified in URL
  if (/^https:\/\/daax\.[\w-]+\.poley\.dev(?::443)?$/.test(origin)) return true;

  return false;
}
