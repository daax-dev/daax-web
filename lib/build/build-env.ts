/**
 * The ONE set of build-stamp names every reader uses (titlebar tooltip,
 * settings > Build panel, /api/build). Client-safe: no Node imports, and each
 * variable is referenced as a literal `process.env.NEXT_PUBLIC_*` so Next.js
 * inlines it into the client bundle at build time.
 *
 * Producers (in precedence order, see next.config.ts):
 *   1. Explicit build inputs — Dockerfile ARG VERSION / GIT_SHA / BUILD_TIME
 *      (set by publish-images.yml, `bun run docker:build`, the compose build
 *      blocks, deploy.sh) or the same names in the shell for `bun run build`.
 *   2. Git fallback for a from-source `bun dev` / `bun run build`.
 *
 * Sentinels: a missing value is the literal "dev" (version) / "unknown"
 * (commit, time) — never a guessed-at, plausible-looking stamp.
 */

export const BUILD_VERSION_UNKNOWN = "dev";
export const BUILD_COMMIT_UNKNOWN = "unknown";
export const BUILD_TIME_UNKNOWN = "unknown";

export interface BuildStamp {
  /** Explicit VERSION or `git describe --tags --match 'v*' [--dirty]`, else "dev". */
  version: string;
  /** Full git commit SHA, else "unknown". */
  commit: string;
  /** UTC RFC3339 build time, else "unknown". */
  time: string;
  /** Git branch at build time (informational; "unknown" when not derivable). */
  branch: string;
}

/** Read the stamped build values (inlined at `next build`). */
export function buildStamp(): BuildStamp {
  return {
    version: process.env.NEXT_PUBLIC_BUILD_VERSION || BUILD_VERSION_UNKNOWN,
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || BUILD_COMMIT_UNKNOWN,
    time: process.env.NEXT_PUBLIC_BUILD_TIME || BUILD_TIME_UNKNOWN,
    branch: process.env.NEXT_PUBLIC_BUILD_BRANCH || "unknown",
  };
}

/** First 7 characters of a commit SHA, or the sentinel unchanged. */
export function shortCommit(commit: string): string {
  return commit === BUILD_COMMIT_UNKNOWN ? commit : commit.slice(0, 7);
}

/** One-line summary for tooltips: `v1.2.3 · abc1234 · 2026-09-09T10:00:00Z · main`. */
export function buildSummary(stamp: BuildStamp = buildStamp()): string {
  const parts = [stamp.version, shortCommit(stamp.commit), stamp.time];
  if (stamp.branch !== "unknown") parts.push(stamp.branch);
  return parts.join(" · ");
}
