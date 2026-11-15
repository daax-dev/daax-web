// SSRF guard for server-side fetches of user-registered remote targets (A2).
//
// The MCP surface lets an authenticated user register an arbitrary `url`
// (POST /api/mcp/config) that the server later fetches (POST /api/mcp/tools) or
// hands to the inspector launcher. A scheme-only check (isAllowedRemoteUrl) does
// not stop the URL from pointing at cloud metadata (169.254.169.254), loopback,
// or RFC1918 / ULA internal services (postgres:5432, sibling containers). This
// module resolves the host to its actual IP addresses and rejects any that fall
// in a private / reserved / link-local range, unless an operator has explicitly
// allow-listed the host via DAAX_MCP_ALLOWED_HOSTS.
//
// This guard validates only the INITIAL host of a URL. Two residual vectors are
// handled elsewhere or documented:
//   - HTTP redirects: a public host that 3xx-redirects to a private/metadata
//     target would re-open the SSRF. The mcp/tools fetch path closes this with
//     `redirect: "error"` (no server-side redirect-following). The mcp-inspector
//     path hands the URL to a spawned `@modelcontextprotocol/inspector` child,
//     which does its own connection — redirect-following THERE is outside daax's
//     control, so validating the initial host is the most that can be done inline
//     (documented residual).
//   - DNS rebinding: we resolve and validate the addresses here, but fetch()
//     performs its own independent DNS resolution for the connection, so a
//     hostname whose record flips between this check and the fetch could still
//     resolve to a private IP at connect time. Fully closing that requires
//     pinning the resolved IP into the connection (custom agent/lookup), which is
//     out of scope for this guard; the check below defeats the common
//     static-target SSRF and every literal-IP attempt, including IPv4-mapped
//     IPv6 in either dotted or hex encoding (the form `new URL()` produces).

import { isIP } from "net";
import { lookup } from "dns/promises";

/**
 * True when `ip` (an IPv4 or IPv6 literal) is loopback, link-local, private
 * (RFC1918 / ULA), the cloud metadata address, or otherwise reserved and must
 * never be reachable by a user-supplied remote fetch target.
 */
export function isPrivateOrReservedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const octets = parseIPv4(ip);
    return octets ? isPrivateIPv4Octets(octets) : true;
  }
  if (fam === 6) return isPrivateIPv6(ip);
  // Not a parseable IP literal → treat as reserved (fail closed).
  return true;
}

function parseIPv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function isPrivateIPv4Octets(
  octets: [number, number, number, number],
): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  // TEST-NET-1/2/3 (RFC 5737) — documentation ranges, never legit public targets.
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240/4 reserved
  return false;
}

/**
 * Expand an IPv6 literal to its 16 raw bytes, or null if unparseable.
 *
 * Handles `::` zero-compression, a zone id (`%eth0`), and an embedded IPv4 tail
 * in EITHER textual form: dotted (`::ffff:169.254.169.254`) OR the hex encoding
 * that `new URL()` normalizes it to (`::ffff:a9fe:a9fe`). The prior regex-only
 * check matched only the dotted form, so every mapped literal that reached this
 * module via a parsed URL slipped through as "public" — the SSRF the validator
 * proved. Working in raw bytes removes all textual-form dependence.
 */
function ipv6ToBytes(ipRaw: string): number[] | null {
  let s = ipRaw.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);

  // Convert a dotted-decimal IPv4 tail to two hex groups so the rest of the
  // parser only deals with hextets.
  const v4 = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const o = parseIPv4(v4[1]);
    if (!o) return null;
    const hex = `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
    s = s.slice(0, v4.index) + hex;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // `::` must stand in for at least one group
    groups = [...head, ...new Array(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return bytes;
}

function isPrivateIPv6(ipRaw: string): boolean {
  const bytes = ipv6ToBytes(ipRaw);
  if (!bytes) return true; // unparseable → fail closed

  // Embedded IPv4: mapped (::ffff:0:0/96) or the deprecated compatible (::/96,
  // which also covers ::/`::1`) — validate the trailing 4 bytes as IPv4 so
  // ::ffff:169.254.169.254 / ::ffff:127.0.0.1 (in ANY textual form) are caught.
  const first10Zero = bytes.slice(0, 10).every((b) => b === 0);
  if (first10Zero) {
    const mapped = bytes[10] === 0xff && bytes[11] === 0xff;
    const compat = bytes[10] === 0 && bytes[11] === 0;
    if (mapped || compat) {
      return isPrivateIPv4Octets([bytes[12], bytes[13], bytes[14], bytes[15]]);
    }
  }

  // NAT64 (64:ff9b::/32, RFC 6052 well-known + RFC 8215 local-use): the embedded
  // IPv4 is what a NAT64 gateway translates to, so a private embedded v4 must be
  // blocked. For the well-known /96 (64:ff9b:: with bytes[4..11] == 0) the v4 is
  // the low 32 bits — decode it so a PUBLIC embedded v4 (e.g. 8.8.8.8) is still
  // allowed while a private one (169.254.169.254) is blocked. For any other
  // sub-prefix under 64:ff9b::/32 (local-use /48, custom lengths) the embedded-v4
  // bit position varies and is not safely decodable here, so block conservatively
  // — those are rare and never a legitimate public end-host literal.
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b
  ) {
    if (bytes.slice(4, 12).every((b) => b === 0)) {
      return isPrivateIPv4Octets([bytes[12], bytes[13], bytes[14], bytes[15]]);
    }
    return true; // non-/96 NAT64 sub-prefix → block conservatively
  }

  // 6to4 (2002::/16, RFC 3056): bytes[2..5] are the embedded IPv4 of the 6to4
  // gateway; `2002:a9fe:a9fe::` routes to 169.254.169.254 via a 6to4 relay.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isPrivateIPv4Octets([bytes[2], bytes[3], bytes[4], bytes[5]]);
  }

  if (bytes[0] === 0xff) return true; // ff00::/8 multicast
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local (deprecated)
  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA (fc/fd)
  return false;
}

/** Operator opt-in: hostnames explicitly allowed to resolve to private ranges. */
function allowedHosts(): Set<string> {
  const raw = process.env.DAAX_MCP_ALLOWED_HOSTS ?? "";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type SsrfCheck =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Validate a user-supplied remote URL before the server fetches it: enforce the
 * http(s) scheme, then resolve the host and reject if ANY resolved address is
 * private / reserved (unless the host is on DAAX_MCP_ALLOWED_HOSTS). Literal-IP
 * hosts are checked directly without a DNS round-trip.
 */
export async function assertPublicHttpUrl(raw: unknown): Promise<SsrfCheck> {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "url must be a non-empty string" };
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "url is not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "url must use the http or https scheme" };
  }

  const host = u.hostname.toLowerCase();
  // URL parsing wraps IPv6 literals in brackets; strip for isIP/lookup.
  const bareHost =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (allowedHosts().has(bareHost)) return { ok: true, url: raw };

  // Literal IP → check directly, no DNS.
  if (isIP(bareHost)) {
    if (isPrivateOrReservedAddress(bareHost)) {
      return {
        ok: false,
        error: "url resolves to a private or reserved address",
      };
    }
    return { ok: true, url: raw };
  }

  // Reject unqualified single-label hosts (e.g. `postgres`, `terminal`) that
  // resolve only via internal DNS to sibling services.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(bareHost, { all: true });
  } catch {
    return { ok: false, error: "url host could not be resolved" };
  }
  if (addrs.length === 0) {
    return { ok: false, error: "url host resolved to no addresses" };
  }
  for (const { address } of addrs) {
    if (isPrivateOrReservedAddress(address)) {
      return {
        ok: false,
        error: "url resolves to a private or reserved address",
      };
    }
  }
  return { ok: true, url: raw };
}
