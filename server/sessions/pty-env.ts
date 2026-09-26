/**
 * PTY child environment (#184 review).
 *
 * The compose files set a generic `HOST` env var on the app container purely
 * as the auth posture signal (exposed-beyond-loopback bind — see
 * lib/auth-trust.ts). Passing it through to every workbench terminal leaks it
 * into child tooling: webpack-dev-server and friends honor `$HOST` as a bind
 * address, and zsh's `HOST` parameter is clobbered. Strip it from the PTY
 * child env only — the app itself keeps reading `process.env.HOST`.
 *
 * daax's own server configuration and credentials are stripped too. Every
 * terminal inherits this env, including a host-mode `claude --resume` and every
 * tool call it makes, so an agent that runs `env` would copy the proxy secret,
 * the WebSocket token secret and the database password into its transcript.
 *
 * The rule is a denylist of names daax owns, not an allowlist of names a shell
 * needs: an allowlist breaks whatever the operator's shell relies on that
 * nobody listed. And the credential pattern is not applied globally, because
 * the operator's own tool auth matches it — CLAUDE_CODE_OAUTH_TOKEN and
 * ANTHROPIC_AUTH_TOKEN are how a host `claude` signs in, GH_TOKEN is how `gh`
 * does. Their shell hands those to any agent they start; daax's secrets it
 * does not. DOCKER_* is untouched, so container mode's `docker run` keeps
 * DOCKER_HOST and friends (and `docker run` passes only its explicit -e flags
 * into the agent container).
 */

/** Every variable under these prefixes is daax's own configuration. */
const DAAX_PREFIXES = ["DAAX_", "AGENTVIEW_", "CLAWD_", "HAWKEYE_"];

/** daax's deploy credentials that carry no daax prefix. */
const DAAX_NAMES = new Set([
  "HOST",
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "PGPASSWORD",
  "GITHUB_DAAX",
]);

export function isDaaxOwnedEnv(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    DAAX_NAMES.has(upper) || DAAX_PREFIXES.some((p) => upper.startsWith(p))
  );
}

export function buildPtyEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(base).filter(([name]) => !isDaaxOwnedEnv(name)),
  ) as NodeJS.ProcessEnv;
}
