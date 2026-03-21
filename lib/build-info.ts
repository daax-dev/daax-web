// Build info injected at build time via next.config.ts
// Access via process.env.NEXT_PUBLIC_BUILD_*

export function getBuildInfo() {
  return {
    hostname: process.env.NEXT_PUBLIC_BUILD_HOSTNAME || "dev",
    branch: process.env.NEXT_PUBLIC_BUILD_BRANCH || "local",
    timestamp:
      process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString(),
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || "000000",
  };
}

export function getBuildString(): string {
  const info = getBuildInfo();
  const shortCommit = info.commit.slice(0, 7);
  return `${info.hostname}/${info.branch}@${shortCommit} - ${info.timestamp}`;
}
