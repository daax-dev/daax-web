/**
 * Who may open a terminal on a HOST-mode daax.
 *
 * In host mode every terminal is host-privileged, whatever its mode. `local`,
 * `shell-tmux` and anything unrecognised run a real shell as the operator's OS
 * user (Agent View "Resume here" is one of them); `container` runs `docker run`
 * with host mounts or `docker exec` into any container named by the client,
 * against the host's docker socket, which is root-equivalent. Authentication
 * alone admitted any identity the forward-auth proxy admits, so this is the
 * authorization half: only an admin may open one.
 *
 * Container mode is decided positively (`isHostMode`): the process must be
 * inside a Docker container (`/.dockerenv`, which Docker creates in every
 * container — both compose files and `docker:run` start daax under Docker)
 * AND `HOST_WORKSPACE_PATH` must be set. An environment variable alone cannot
 * decide it, because a host process can inherit one; a file at the root of the
 * filesystem cannot be inherited. A runtime that does not create `/.dockerenv`
 * is treated as host mode, which gates it: the failure is closed.
 *
 * "Admin" is a SUBJECT (Pocket ID UUID) entry of `DAAX_ADMIN_USERS`, matched
 * case-insensitively. Email and username entries are ignored here: they are
 * mutable attributes a user may be able to set (and `entryMatchesUser` compares
 * an attribute entry against either field), so they are acceptable for the HTTP
 * plane's role grant and not for a shell. The terminal server has no Postgres,
 * so a role granted only in the UI is not honoured either — this rule is
 * narrower than the HTTP plane's, never wider.
 *
 * A list with no subject entry refuses every authenticated identity (fail
 * closed). The local-operator bypass is not an identity and is decided by the
 * caller, as `resolveAccess()` treats it as admin on the HTTP plane.
 *
 * No `server-only` import: the terminal server imports this outside Next.
 */
import { existsSync } from "node:fs";

import { parseAdminAllowlist } from "./rbac/allowlist";

export type HostShellDecision = { ok: true } | { ok: false; reason: string };

type Env = Record<string, string | undefined>;

/**
 * True unless this process is provably daax's own container: inside Docker and
 * with `HOST_WORKSPACE_PATH` set. Every terminal a host-mode daax opens is
 * host-privileged.
 */
export function isHostMode(env: Env = process.env): boolean {
  return !(env.HOST_WORKSPACE_PATH && existsSync("/.dockerenv"));
}

/**
 * Decide whether an authenticated subject may open a host-mode terminal.
 * Reasons fit a WebSocket close frame (≤123 bytes) and name the cause.
 */
export function decideHostShell(
  subject: string | null,
  env: Env = process.env,
): HostShellDecision {
  const admins = parseAdminAllowlist(env.DAAX_ADMIN_USERS)
    .filter((entry) => entry.kind === "subject")
    .map((entry) => entry.value);
  if (admins.length === 0) {
    return {
      ok: false,
      reason:
        "host terminal refused: DAAX_ADMIN_USERS names no subject UUID, so no one is an admin",
    };
  }
  const key = subject?.trim().toLowerCase();
  if (!key) {
    return { ok: false, reason: "host terminal refused: no subject to check" };
  }
  return admins.includes(key)
    ? { ok: true }
    : { ok: false, reason: "host terminal refused: not in DAAX_ADMIN_USERS" };
}
