/**
 * Loopback address detection (issue #184).
 *
 * Single source of truth for "is this address the local loopback interface?",
 * shared by the WebSocket plane (`server/handlers/ws-auth.ts`, which inspects the
 * unspoofable TCP peer) and the HTTP plane (`lib/auth-trust.ts`, which inspects
 * the server's configured bind host). Pure and dependency-free so it can be
 * imported from any runtime (terminal server, Next route handlers, middleware)
 * without pulling server-only modules along.
 *
 * Previously this logic lived inline in `ws-auth.ts`; it was extracted here so
 * the two planes cannot drift (issue #184, AC#5).
 */

/**
 * True when `addr` refers to the IPv4/IPv6 loopback interface.
 *
 * Normalizes IPv4-mapped IPv6 (`::ffff:127.0.0.1`) and accepts IPv6 loopback
 * (`::1`), the entire `127.0.0.0/8` block, and the literal `localhost`. An
 * absent/empty value is NOT loopback (returns false) — callers treat "unknown"
 * as non-loopback so an unresolved address never grants trust.
 */
export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const a = addr
    .trim()
    .replace(/^::ffff:/i, "")
    .toLowerCase();
  return (
    a === "::1" ||
    a === "127.0.0.1" ||
    a.startsWith("127.") ||
    a === "localhost"
  );
}
