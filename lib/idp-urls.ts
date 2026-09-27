/**
 * Per-host identity-provider URLs, read from server env at call time.
 *
 * Every host runs its own Pocket ID (https://auth.<host>.poley.dev on the
 * fleet), so neither URL has a default: a compiled-in provider would send every
 * host's browsers to one IdP that is not theirs. Unset means "not configured"
 * and the caller degrades (initials instead of a picture; a local-only log out).
 *
 * Read at call time rather than module load so one published image serves every
 * host, and so tests can set the env per case. Free of Next.js imports: this is
 * reached from lib/auth-trust.ts, which middleware.ts also imports.
 */

const warned = new Set<string>();

function warnOnce(name: string, value: string, why: string): void {
  const key = `${name}=${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[auth] ${name} ignored: ${why} (got ${JSON.stringify(value)})`);
}

function readHttps(name: string): URL | null {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    warnOnce(name, raw, "not a URL");
    return null;
  }
  if (url.protocol !== "https:") {
    warnOnce(name, raw, "must be https");
    return null;
  }
  if (url.username || url.password) {
    warnOnce(name, raw, "must not carry credentials");
    return null;
  }
  return url;
}

/**
 * DAAX_AUTH_PROVIDER_URL as a bare https origin (e.g.
 * "https://auth.galway.poley.dev"), or null when unset or invalid. A path,
 * query or fragment is refused rather than dropped, since the avatar URL is
 * built by appending to it.
 */
export function idpOrigin(): string | null {
  const name = "DAAX_AUTH_PROVIDER_URL";
  const url = readHttps(name);
  if (!url) return null;
  if (url.pathname !== "/" || url.search || url.hash) {
    warnOnce(name, process.env[name]!.trim(), "must be a bare origin");
    return null;
  }
  return url.origin;
}

/**
 * DAAX_AUTH_LOGOUT_URL, the page the browser is sent to after the local sign
 * out, or null when unset or not https. On Pocket ID this is `<idp>/logout`,
 * which asks for confirmation and takes no redirect parameter.
 */
export function logoutUrl(): string | null {
  return readHttps("DAAX_AUTH_LOGOUT_URL")?.href ?? null;
}
