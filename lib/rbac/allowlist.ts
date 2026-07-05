/**
 * Admin allow-list + group→role mapping parsing (F5 — issue #101).
 *
 * The operator writes `DAAX_ADMIN_USERS` naturally with emails/usernames, but a
 * `users` row (keyed on the stable subject) only exists after first login. So
 * the allow-list must accept EITHER a subject OR an email/username, matched with
 * documented semantics (docs/brain2daax.md §3 F5):
 *   - a subject-shaped entry is matched EXACTLY against `users.subject`;
 *   - anything else is matched case-insensitively against the mutable display
 *     attributes (email / username) — for GRANT purposes only, never as the key.
 *
 * Pure and framework-agnostic so it is directly unit-testable.
 */

/** One parsed allow-list entry. */
export interface AllowlistEntry {
  /** The raw token as written by the operator (trimmed). */
  raw: string;
  /**
   * How to match it. `subject` → exact against users.subject; `attr` →
   * case-insensitive against email/username (stored lowercased in `value`).
   */
  kind: "subject" | "attr";
  /** The comparison value (lowercased for `attr`, raw for `subject`). */
  value: string;
}

/**
 * Heuristic: a Pocket ID subject is a UUID. Anything matching the UUID shape is
 * treated as a subject; everything else (email, username) is an attribute match.
 * This is deliberately conservative — a username that happens to be UUID-shaped
 * is vanishingly unlikely and would still only affect GRANT matching, never the
 * identity key.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function classifyAllowlistToken(token: string): AllowlistEntry | null {
  const raw = token.trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) {
    return { raw, kind: "subject", value: raw };
  }
  return { raw, kind: "attr", value: raw.toLowerCase() };
}

/**
 * Parse a comma/whitespace-separated allow-list (e.g. `DAAX_ADMIN_USERS`) into
 * classified entries. Empty tokens are skipped; duplicates are de-duplicated on
 * (kind, value).
 */
export function parseAdminAllowlist(raw: string | undefined): AllowlistEntry[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: AllowlistEntry[] = [];
  for (const token of raw.split(/[,\s]+/)) {
    const entry = classifyAllowlistToken(token);
    if (!entry) continue;
    const key = `${entry.kind}:${entry.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** A user's identifying attributes, used to test allow-list membership. */
export interface UserIdentity {
  subject: string;
  email: string | null;
  username: string | null;
}

/**
 * True when the given user matches the allow-list entry. Subject entries match
 * exactly; attribute entries match the lowercased email OR username.
 */
export function entryMatchesUser(
  entry: AllowlistEntry,
  user: UserIdentity,
): boolean {
  if (entry.kind === "subject") return entry.value === user.subject;
  const email = user.email?.trim().toLowerCase() || null;
  const username = user.username?.trim().toLowerCase() || null;
  return entry.value === email || entry.value === username;
}

/** True when ANY allow-list entry matches the user. */
export function isUserAllowlisted(
  entries: readonly AllowlistEntry[],
  user: UserIdentity,
): boolean {
  return entries.some((e) => entryMatchesUser(e, user));
}

/**
 * Parse a group→role map from `DAAX_GROUP_ROLE_MAP`, formatted as
 * `group1:role1,group2:role2`. Unknown/empty pairs are skipped. Returns a map
 * from group name → set of role names. Case-sensitive on group names (Pocket ID
 * group names are opaque identifiers), role names lowercased-trimmed.
 */
export function parseGroupRoleMap(
  raw: string | undefined,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const group = pair.slice(0, idx).trim();
    const role = pair.slice(idx + 1).trim();
    if (!group || !role) continue;
    if (!map.has(group)) map.set(group, new Set());
    map.get(group)!.add(role);
  }
  return map;
}

/** Resolve the roles a set of Pocket ID groups maps to (deduped, sorted). */
export function rolesForGroups(
  groups: readonly string[],
  groupRoleMap: Map<string, Set<string>>,
): string[] {
  const roles = new Set<string>();
  for (const g of groups) {
    const mapped = groupRoleMap.get(g);
    if (mapped) for (const r of mapped) roles.add(r);
  }
  return [...roles].sort();
}
