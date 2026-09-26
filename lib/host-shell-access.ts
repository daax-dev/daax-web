/**
 * Who may open a HOST shell from a terminal WebSocket.
 *
 * In host mode (`HOST_WORKSPACE_PATH` unset) every terminal mode other than
 * `container` — `local`, `shell-tmux`, and anything unrecognised, which
 * `buildShellCommand` also runs as a local shell — spawns a real shell as the
 * operator's OS user on the machine. Agent View "Resume here" is one of them.
 * Authentication alone admitted any identity the forward-auth proxy admits, so
 * this is the authorization half: only an admin may open one.
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
 * In container mode (`HOST_WORKSPACE_PATH` set) a non-container terminal runs
 * inside the daax container and is left as it was.
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

/** True when daax runs directly on the host rather than in its container. */
export function isHostMode(env: Env = process.env): boolean {
  return !env.HOST_WORKSPACE_PATH;
}

/** True when a terminal of this `mode` would be a shell on the host itself. */
export function opensHostShell(mode: string, env: Env = process.env): boolean {
  return isHostMode(env) && mode !== "container";
}

/**
 * Decide whether an authenticated identity may open a host shell. Reasons are
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
        "host shell refused: DAAX_ADMIN_USERS is empty, so no one is an admin",
    };
  }
  const subject = identity.subject?.trim();
  if (!subject) {
    return { ok: false, reason: "host shell refused: no subject to check" };
  }
  const admin = isUserAllowlisted(entries, {
    subject,
    username: identity.username,
    email: identity.email,
  });
  return admin
    ? { ok: true }
    : { ok: false, reason: "host shell refused: not in DAAX_ADMIN_USERS" };
}
