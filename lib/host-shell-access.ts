/**
 * Who may open a terminal on a HOST-mode daax.
 *
 * In host mode (`HOST_WORKSPACE_PATH` unset) every terminal is host-privileged,
 * whatever its mode. `local`, `shell-tmux` and anything unrecognised run a real
 * shell as the operator's OS user (Agent View "Resume here" is one of them);
 * `container` runs `docker run` with host mounts or `docker exec` into any
 * container named by the client, against the host's docker socket, which is
 * root-equivalent. Authentication alone admitted any identity the forward-auth
 * proxy admits, so this is the authorization half: only an admin may open one.
 *
 * "Admin" is decided by `DAAX_ADMIN_USERS`, matched with the same functions the
 * HTTP plane's boot reconcile uses to grant the `admin` role
 * (`parseAdminAllowlist` / `isUserAllowlisted`): a UUID entry matches the
 * subject, anything else the email or username, case-insensitively. The terminal
 * server has no Postgres, so a role granted only in the UI is NOT honoured here
 * — the rule is narrower than the HTTP plane's, never wider.
 *
 * An empty `DAAX_ADMIN_USERS` refuses every authenticated identity (fail
 * closed). The local-operator bypass is not an identity and is decided by the
 * caller, exactly as `resolveAccess()` treats it as admin on the HTTP plane.
 *
 * In container mode (`HOST_WORKSPACE_PATH` set) terminals are left as they were.
 *
 * No `server-only` import: the terminal server imports this outside Next.
 */
import { isUserAllowlisted, parseAdminAllowlist } from "./rbac/allowlist";

/** The identity attributes an admin allow-list entry can match. */
export interface ShellIdentity {
  subject: string | null;
  username: string | null;
  email: string | null;
}

export type HostShellDecision = { ok: true } | { ok: false; reason: string };

type Env = Record<string, string | undefined>;

/**
 * True when daax runs directly on the host rather than in its container, which
 * makes every terminal it opens host-privileged.
 */
export function isHostMode(env: Env = process.env): boolean {
  return !env.HOST_WORKSPACE_PATH;
}

/**
 * Decide whether an authenticated identity may open a host-mode terminal. Reasons are
 * short enough for a WebSocket close frame (≤123 bytes) and name the cause.
 */
export function decideHostShell(
  identity: ShellIdentity,
  env: Env = process.env,
): HostShellDecision {
  const entries = parseAdminAllowlist(env.DAAX_ADMIN_USERS);
  if (entries.length === 0) {
    return {
      ok: false,
      reason:
        "host terminal refused: DAAX_ADMIN_USERS is empty, so no one is an admin",
    };
  }
  const subject = identity.subject?.trim();
  if (!subject) {
    return { ok: false, reason: "host terminal refused: no subject to check" };
  }
  const admin = isUserAllowlisted(entries, {
    subject,
    username: identity.username,
    email: identity.email,
  });
  return admin
    ? { ok: true }
    : { ok: false, reason: "host terminal refused: not in DAAX_ADMIN_USERS" };
}
