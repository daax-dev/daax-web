import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get build info at config load time
function getBuildEnv() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  // Get hostname from env var (Dockerfile) or shell command
  const hostname = process.env.BUILD_HOST || getHostname();

  // Get git branch from command or env var fallback
  const branch = getBranch();

  // Get git commit from command or env var fallback
  const commit = getCommit();

  return { hostname, branch, commit, timestamp };
}

function getHostname(): string {
  // Note: BUILD_HOST is already checked by caller getBuildEnv() at line 10
  // This function handles HOSTNAME env var and shell command fallback
  if (process.env.HOSTNAME) return process.env.HOSTNAME;
  try {
    return execSync("hostname -s", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function getBranch(): string {
  // Prefer env var (set during docker build)
  if (process.env.BUILD_BRANCH) return process.env.BUILD_BRANCH;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function getCommit(): string {
  // Prefer env var (set during docker build)
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "000000";
  }
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
    NEXT_PUBLIC_BUILD_HOSTNAME: buildEnv.hostname,
    NEXT_PUBLIC_BUILD_BRANCH: buildEnv.branch,
    NEXT_PUBLIC_BUILD_COMMIT: buildEnv.commit,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildEnv.timestamp,
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
