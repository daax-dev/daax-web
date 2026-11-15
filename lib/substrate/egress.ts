/**
 * Per-session EgressPolicy (dx#118): default-deny plus explicit, reviewed
 * exceptions, never a private-range opening.
 *
 * Validation is a port of substrate-harness `harness/egress.go`
 * (normalizeHost, rebindDomains, wildcardTooBroad, nonPublic,
 * CheckResolution, NormalizeHosts, EgressRules). Keep the two in step.
 *
 * Rules, in order:
 *   1. the LLM gateway: plain HTTP to `<llmHost>:<llmPort>` (all five agents'
 *      providers go through it; the gateway holds every key);
 *   2. the Watchtower hook route through the gateway, ONLY when the operator
 *      configured `DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL` (placeholder until that
 *      agentgateway route exists in substrate-harness);
 *   3. user-selected presets (npm, PyPI, GitHub) and validated extra hosts as
 *      TLS passthrough on 443.
 *
 * Operator-configured gateway hosts (1, 2) are cluster names by design and are
 * NOT run through the public-host validation; user-supplied hosts (3) are.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_EGRESS_HOSTS = 50;

/** User-selectable allowlist presets (dx#118). Each is a reviewed host set. */
export const EGRESS_PRESETS = {
  npm: ["registry.npmjs.org"],
  pypi: ["pypi.org", "files.pythonhosted.org"],
  github: [
    "github.com",
    "api.github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "raw.githubusercontent.com",
  ],
} as const satisfies Record<string, readonly string[]>;
export type EgressPreset = keyof typeof EGRESS_PRESETS;

export function isEgressPreset(v: unknown): v is EgressPreset {
  return typeof v === "string" && Object.hasOwn(EGRESS_PRESETS, v);
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

const BLOCKED_TLDS = [
  "local",
  "localhost",
  "internal",
  "svc",
  "cluster",
  "lan",
  "home",
  "arpa",
  "localdomain",
  "default",
  "corp",
  "intranet",
  "test",
  "invalid",
];

/** Wildcard-DNS services that map names to arbitrary IPs (rebinding). */
export const REBIND_DOMAINS = [
  "sslip.io",
  "nip.io",
  "xip.io",
  "nip.direct",
  "traefik.me",
  "localtest.me",
  "lvh.me",
  "vcap.me",
  "lacolhost.com",
  "localhost.direct",
  "1u.ms",
  "rbndr.us",
  "backname.io",
  "ip6.name",
  "nip.lol",
  "local.gd",
  "localh.st",
];

const BROAD_SUFFIXES = [
  "github.io",
  "amazonaws.com",
  "cloudfront.net",
  "herokuapp.com",
  "appspot.com",
  "azurewebsites.net",
  "blob.core.windows.net",
  "cloudflare.net",
  "pages.dev",
  "workers.dev",
  "vercel.app",
  "netlify.app",
  "fly.dev",
  "onrender.com",
  "web.app",
  "firebaseapp.com",
  "ngrok.io",
  "ngrok-free.app",
  "trycloudflare.com",
  "duckdns.org",
];

const CC_SECOND_LEVEL = [
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "ne",
  "or",
  "go",
  "gv",
  "mil",
  "nic",
  "ltd",
  "plc",
  "sch",
];

export class EgressValidationError extends Error {}

function wildcardTooBroad(labels: string[]): boolean {
  if (BROAD_SUFFIXES.includes(labels.join("."))) return true;
  return (
    labels.length === 2 &&
    labels[1].length === 2 &&
    CC_SECOND_LEVEL.includes(labels[0])
  );
}

/** Validate one allowlist entry ("example.com" or "*.example.com"). */
export function normalizeHost(raw: string): string {
  let h = raw.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (!h) throw new EgressValidationError("empty hostname");
  if (h.length > 253) throw new EgressValidationError(`"${h}": too long`);
  let base = h;
  const wildcard = h.startsWith("*.");
  if (wildcard) base = h.slice(2);
  if (isIP(base) || isIP(base.replace(/^\[|\]$/g, ""))) {
    throw new EgressValidationError(
      `"${h}": IP addresses are not allowed, name a public hostname`,
    );
  }
  const labels = base.split(".");
  if (labels.length < 2) {
    throw new EgressValidationError(
      `"${h}": must be a fully-qualified public hostname`,
    );
  }
  for (const l of labels) {
    if (!LABEL_RE.test(l))
      throw new EgressValidationError(`"${h}": invalid hostname`);
  }
  const tld = labels[labels.length - 1];
  if (!TLD_RE.test(tld)) {
    throw new EgressValidationError(
      `"${h}": invalid top-level domain (IP addresses are not allowed)`,
    );
  }
  if (BLOCKED_TLDS.includes(tld) || base.endsWith(".cluster.local")) {
    throw new EgressValidationError(`"${h}": internal domains are not allowed`);
  }
  for (const d of REBIND_DOMAINS) {
    if (base === d || base.endsWith("." + d)) {
      throw new EgressValidationError(
        `"${h}": wildcard-DNS services that map names to arbitrary IPs are not allowed`,
      );
    }
  }
  if (wildcard && wildcardTooBroad(labels)) {
    throw new EgressValidationError(`"${h}": wildcard too broad`);
  }
  return h;
}

/**
 * Validate, lower-case, de-duplicate and sort hosts. Operator gateway hosts
 * are dropped (they are always their own rule).
 */
export function normalizeHosts(
  hosts: readonly string[],
  gatewayHosts: readonly string[] = [],
): string[] {
  const skip = new Set(gatewayHosts.map((g) => g.toLowerCase()));
  const out = new Set<string>();
  for (const raw of hosts) {
    const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");
    if (skip.has(trimmed)) continue;
    out.add(normalizeHost(raw));
  }
  if (out.size > MAX_EGRESS_HOSTS) {
    throw new EgressValidationError(
      `at most ${MAX_EGRESS_HOSTS} hosts allowed`,
    );
  }
  return [...out].sort();
}

/** Hosts for the selected presets plus extra user hosts, validated. */
export function resolveEgressHosts(
  presets: readonly EgressPreset[],
  extra: readonly string[],
  gatewayHosts: readonly string[] = [],
): string[] {
  const all: string[] = [];
  for (const p of presets) all.push(...EGRESS_PRESETS[p]);
  all.push(...extra);
  return normalizeHosts(all, gatewayHosts);
}

// ---- non-public address check (defence in depth; DNS can change later) ----

function ipv4ToInt(a: string): number {
  return (
    a.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4NonPublic(a: string): boolean {
  const n = ipv4ToInt(a);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

function expandV6(a: string): number[] | null {
  let s = a.toLowerCase().split("%")[0];
  // Embedded IPv4 tail (::ffff:1.2.3.4).
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    s =
      s.slice(0, -v4[1].length) +
      ((n >>> 16) & 0xffff).toString(16) +
      ":" +
      (n & 0xffff).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  const parts = [...h, ...Array(tail === undefined ? 0 : fill).fill("0"), ...t];
  return parts.map((p) => parseInt(p || "0", 16));
}

/** True for any address an allowlisted name must never resolve to. */
export function isNonPublicAddress(addr: string): boolean {
  const fam = isIP(addr);
  if (fam === 4) return v4NonPublic(addr);
  if (fam !== 6) return true;
  const w = expandV6(addr);
  if (!w) return true;
  // IPv4-mapped ::ffff:a.b.c.d -> check the v4 part.
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) {
    const v4 = `${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`;
    return v4NonPublic(v4);
  }
  if (w.every((x) => x === 0)) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
  const first = w[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x64 && w[1] === 0xff9b) return true; // 64:ff9b::/96, /48
  if (first === 0x100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return true; // 100::/64
  if (first === 0x2001 && w[1] === 0xdb8) return true; // documentation
  if (first === 0x2002) return true; // 6to4
  return false;
}

export type Resolver = (host: string) => Promise<string[]>;

export const defaultResolver: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Reject concrete (non-wildcard) hosts that currently resolve to a non-public
 * address. Names that don't resolve from here are allowed: the egress
 * gateway's network lockdown is the real control.
 */
export async function checkResolution(
  hosts: readonly string[],
  resolve: Resolver = defaultResolver,
  timeoutMs = 5000,
): Promise<void> {
  const concrete = hosts.filter((h) => !h.startsWith("*."));
  const results = await Promise.all(
    concrete.map(async (host) => {
      try {
        const addrs = await Promise.race([
          resolve(host),
          new Promise<string[]>((r) => setTimeout(() => r([]), timeoutMs)),
        ]);
        const bad = addrs.find(isNonPublicAddress);
        return bad ? `${host} (resolves to ${bad})` : null;
      } catch {
        return null;
      }
    }),
  );
  const bad = results.filter((r): r is string => r !== null).sort();
  if (bad.length > 0) {
    throw new EgressValidationError(
      `hosts resolving to private or internal addresses are not allowed: ${bad.join(", ")}`,
    );
  }
}

export interface EgressGateways {
  llmHost: string;
  llmPort: number;
  watchtowerHook?: { host: string; port: number };
}

type Rule =
  | { http: { hostnames: string[]; ports: { numbers: number[] } } }
  | { tlsPassthrough: { hostnames: string[]; ports: { numbers: number[] } } };

/** protojson rules: gateway http rule(s) first, then TLS passthrough :443. */
export function egressRules(
  gw: EgressGateways,
  hosts: readonly string[],
): Rule[] {
  const rules: Rule[] = [
    { http: { hostnames: [gw.llmHost], ports: { numbers: [gw.llmPort] } } },
  ];
  if (gw.watchtowerHook) {
    rules.push({
      http: {
        hostnames: [gw.watchtowerHook.host],
        ports: { numbers: [gw.watchtowerHook.port] },
      },
    });
  }
  if (hosts.length > 0) {
    // The API requires ports explicitly (it does not default to 443).
    rules.push({
      tlsPassthrough: { hostnames: [...hosts], ports: { numbers: [443] } },
    });
  }
  return rules;
}

/** Create manifest (JSON is valid YAML; `kubectl ate` accepts both). */
export function renderEgressPolicy(
  gw: EgressGateways,
  hosts: readonly string[],
): string {
  return JSON.stringify({ rules: egressRules(gw, hosts) }, null, 2);
}
