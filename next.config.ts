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

const nextConfig: NextConfig = {
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
