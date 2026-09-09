import type { NextConfig } from "next";
import { execSync } from "child_process";
import packageJson from "./package.json";

// Build stamp, resolved once at config load and inlined as NEXT_PUBLIC_BUILD_*
// (see lib/build/build-env.ts for the reader side). Three explicit inputs —
// VERSION, GIT_SHA, BUILD_TIME — are preferred over anything derived here, so a
// container build is stamped from what the builder was TOLD (Dockerfile ARGs,
// set by publish-images.yml / docker:build / compose / deploy.sh) rather than
// from whatever `.git` happens to be in the build context. The git fallback
// stays for a from-source `bun dev` / `bun run build`; when git is unavailable,
// version/commit degrade to sentinels while time records the actual config-load
// time.
//
// Precedence per value: NEXT_PUBLIC_BUILD_* already in the environment (the
// runner image sets these, so `next start` never shells out) → the explicit
// input → git → sentinel.
function sh(cmd: string): string | null {
  try {
    const out = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function pick(...candidates: Array<string | undefined | null>): string | null {
  for (const c of candidates) if (c && c.trim()) return c.trim();
  return null;
}

function getBuildEnv() {
  const env = process.env;
  // Only a reachable `v*` tag makes a version (no `--always`: a bare short SHA
  // is not a version, and the commit is stamped separately). Absent → "dev",
  // which the Build page renders as package.json "v<version>+<sha7>".
  const version =
    pick(env.NEXT_PUBLIC_BUILD_VERSION, env.VERSION) ??
    sh("git describe --tags --match 'v*' --dirty") ??
    "dev";
  const commit =
    pick(env.NEXT_PUBLIC_BUILD_COMMIT, env.GIT_SHA) ??
    sh("git rev-parse HEAD") ??
    "unknown";
  const time =
    pick(env.NEXT_PUBLIC_BUILD_TIME, env.BUILD_TIME) ??
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  // Branch is informational (a tag build has none); BUILD_BRANCH is the
  // optional Dockerfile ARG, else the checkout's branch.
  const branch =
    pick(env.NEXT_PUBLIC_BUILD_BRANCH, env.BUILD_BRANCH) ??
    sh("git rev-parse --abbrev-ref HEAD") ??
    "unknown";
  // Build host is only meaningful for a from-source build (see getDeployment);
  // BUILD_HOST/HOSTNAME are honored so a CI/host build can name itself.
  const hostname =
    pick(env.NEXT_PUBLIC_BUILD_HOSTNAME, env.BUILD_HOST, env.HOSTNAME) ??
    sh("hostname -s") ??
    "unknown";
  return { version, commit, time, branch, hostname };
}

const buildEnv = getBuildEnv();

// Content-Security-Policy (#192). Shipped as REPORT-ONLY, deliberately:
// enforcing it here (in next.config, with no middleware to emit per-request
// nonces) cannot be verified not to blank the app, and the app is an operator
// console where a blank page is worse than a missing containment layer. The
// specific blockers to a strict enforced CSP are:
//   - Next.js App Router injects inline bootstrap <script>/<style> tags; without
//     a nonce (which requires middleware — out of scope for this change) these
//     need 'unsafe-inline'.
//   - ghostty-web instantiates WebAssembly at runtime → needs 'wasm-unsafe-eval'.
//   - The code-server iframe (daax-code.<host>) and clawd gateway iframe
//     (clawd.<host>) plus the terminal WebSocket (wss://daax.<host>/ws) live on
//     per-deployment subdomains not known statically here, so frame-src/
//     connect-src use the `https:` and `wss:` schemes rather than exact origins.
// Clickjacking is still ENFORCED via X-Frame-Options: DENY below (report-only
// CSP does not weaken that). Report-Only surfaces violations for a future
// nonce-based, enforced policy (via middleware) without risking an outage now.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
]
  .join("; ")
  .concat(";");

// Security headers applied to every response (#192). X-Frame-Options,
// X-Content-Type-Options and Referrer-Policy are ENFORCED (safe, no app
// functionality depends on them being absent); the CSP is Report-Only (see note
// above). X-Powered-By is removed via `poweredByHeader: false`.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework (#192): drop the default X-Powered-By header.
  poweredByHeader: false,
  devIndicators: {
    position: "bottom-right",
  },
  // Externalize native Node.js modules that Turbopack can't bundle
  serverExternalPackages: ["dockerode", "ssh2", "cpu-features"],
  turbopack: {
    root: process.cwd(),
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildEnv.version,
    NEXT_PUBLIC_BUILD_PACKAGE_VERSION: packageJson.version,
    NEXT_PUBLIC_BUILD_COMMIT: buildEnv.commit,
    NEXT_PUBLIC_BUILD_TIME: buildEnv.time,
    NEXT_PUBLIC_BUILD_BRANCH: buildEnv.branch,
    NEXT_PUBLIC_BUILD_HOSTNAME: buildEnv.hostname,
  },
  // Security headers on every route (#192). Note: Next.js `headers()` applies to
  // page/route responses; API routes under app/ are also covered by the `/:path*`
  // matcher (path-to-regexp: matches zero-or-more segments, so `/` is included).
  // Middleware would additionally cover matcher-excluded assets, but no
  // middleware.ts exists yet (see #181) and adding one is out of scope here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Proxy rewrites for embedded tool containers
  // These allow Daax to act as a reverse proxy to other containers
  async rewrites() {
    return [
      // IT Tools - utility tools collection (CorentinTh/it-tools)
      {
        source: "/proxy/it-tools/:path*",
        destination: `${process.env.IT_TOOLS_URL || "http://localhost:8080"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
