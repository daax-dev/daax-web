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
 *
 * `isAllowedOrigin` is the single decision point for both the Next middleware
 * CSRF check (`middleware.ts`) and the terminal WS upgrade
 * (`server/handlers/ws-auth.ts`), so the operator-declared extras below are
 * honoured by both planes without either caller knowing about them.
 */

/**
 * Operator-declared exact extra origins (`DAAX_EXTRA_ALLOWED_ORIGINS`,
 * comma-separated). Exists for a name the built-in patterns do not cover, e.g.
 * a second daax served at `https://daax-host.<host>.poley.dev`. Rewriting Origin
 * at the proxy instead would defeat the CSRF check for every caller.
 *
 * Each entry must be a bare https origin: no path (not even a trailing slash),
 * query, fragment, credentials or wildcard. The host is lowercased and a default
 * :443 dropped, which is how a browser serialises the Origin header; the header
 * is then compared by exact string equality — no suffix or prefix matching.
 * Empty entries (a trailing comma) are ignored. Anything else that does not
 * parse THROWS, naming the entry: a typo must fail loudly rather than turn into
 * silent 403s.
 */
export const EXTRA_ALLOWED_ORIGINS_ENV = "DAAX_EXTRA_ALLOWED_ORIGINS";

export function parseExtraAllowedOrigins(
  raw: string | undefined,
): ReadonlySet<string> {
  const origins = new Set<string>();
  if (!raw) return origins;
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const fail = (why: string): never => {
      throw new Error(
        `${EXTRA_ALLOWED_ORIGINS_ENV}: invalid entry "${entry}": ${why}`,
      );
    };
    if (entry.includes("*")) fail("wildcards are not supported");
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      return fail("not a URL");
    }
    if (url.protocol !== "https:") fail("scheme must be https");
    if (url.username || url.password) fail("credentials are not allowed");
    if (entry.endsWith("/") || url.pathname !== "/")
      fail("an origin has no path (and no trailing slash)");
    if (url.search || entry.includes("?")) fail("an origin has no query");
    if (url.hash || entry.includes("#")) fail("an origin has no fragment");
    origins.add(url.origin);
  }
  return origins;
}

// Parsed once per distinct env value, so the per-request cost is a Set lookup
// and a test that changes the env sees the new value.
let cachedRaw: string | undefined;
let cachedOrigins: ReadonlySet<string> = new Set();

/**
 * The parsed `DAAX_EXTRA_ALLOWED_ORIGINS`. Throws on an invalid entry. Called
 * at boot by `instrumentation.ts` (Next) and `server/terminal-server.ts` so a
 * bad value stops startup, and again by `isAllowedOrigin` on every check.
 */
export function extraAllowedOrigins(): ReadonlySet<string> {
  const raw = process.env[EXTRA_ALLOWED_ORIGINS_ENV];
  if (raw !== cachedRaw) {
    cachedOrigins = parseExtraAllowedOrigins(raw);
    cachedRaw = raw;
  }
  return cachedOrigins;
}

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
  // Parsed first so a malformed DAAX_EXTRA_ALLOWED_ORIGINS throws on every
  // check, not only for origins the built-in patterns below do not cover.
  const extras = extraAllowedOrigins();

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

  // Operator-declared exact origins (DAAX_EXTRA_ALLOWED_ORIGINS).
  if (extras.has(origin)) return true;

  return false;
}
