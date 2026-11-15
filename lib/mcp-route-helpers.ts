// Shared helpers for the MCP API routes (#182).
//
// These were previously duplicated across app/api/mcp/tools/route.ts,
// app/api/plugins/mcp-inspector/route.ts, and app/api/mcp/config/route.ts.
// They are consolidated here so the discovery-scope, remote-URL scheme guard,
// and minimal-child-env behavior stay in lock-step across every route.

import { existsSync } from "fs";

// Default project path used to scope MCP discovery: /workspace in container
// mode (detected via CLAUDE_CODE_CONFIG or a mounted /workspace), otherwise the
// current working directory.
export function getDefaultProjectPath(): string {
  if (process.env.CLAUDE_CODE_CONFIG || existsSync("/workspace")) {
    return "/workspace";
  }
  return process.cwd();
}

// Validation of a remote MCP target URL now lives in lib/ssrf-guard.ts
// (assertPublicHttpUrl): it enforces the http/https scheme AND resolves the host
// to reject private / link-local / metadata / RFC1918 targets before any
// server-side fetch (A2). The old scheme-only `isAllowedRemoteUrl` was replaced
// by that stronger guard at every call site.

// Build an explicit, minimal env for a spawned MCP child process (#182). Only
// PATH and HOME from the app environment (so the launcher is resolvable), plus
// the registered MCP's own declared env, plus any explicit `extra` overrides
// (e.g. inspector port variables). The full process.env is never spread in, so
// app secrets (GITHUB_TOKEN, DATABASE_URL, ...) are not leaked into the child.
export function buildChildEnv(
  configEnv?: Record<string, string>,
  extra?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (configEnv) {
    for (const [key, value] of Object.entries(configEnv)) {
      if (typeof value === "string") env[key] = value;
    }
  }
  return extra ? { ...env, ...extra } : env;
}
