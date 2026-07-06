/**
 * PTY child environment (#184 review).
 *
 * The compose files set a generic `HOST` env var on the app container purely
 * as the auth posture signal (exposed-beyond-loopback bind — see
 * lib/auth-trust.ts). Passing it through to every workbench terminal leaks it
 * into child tooling: webpack-dev-server and friends honor `$HOST` as a bind
 * address, and zsh's `HOST` parameter is clobbered. Strip it from the PTY
 * child env only — the app itself keeps reading `process.env.HOST`.
 */
export function buildPtyEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.HOST;
  return env;
}
