/**
 * Security-relevant settings: validation + effective-value resolution
 * (multi-tenancy — dx#119).
 *
 * These keys decide what a terminal may run and mount, so they are resolved
 * SERVER-side and signed into the WS ticket; the browser's localStorage copy is
 * only a UI cache. Everything else in `DaaxSettings` is a pure UI preference
 * and stays in localStorage.
 *
 * Precedence for one key:
 *   admin per-user override  >  (locked ? admin default : user value)  >  admin default
 *
 * `mountRoot` is admin-only: a user can never set it. It is a path RELATIVE to
 * the workspace root that the user's terminal mounts are confined to (empty /
 * unset = the whole workspace, today's behaviour).
 *
 * Pure: no I/O, no Next imports — used by the app (ticket mint, settings
 * routes) and unit-tested directly.
 */
import { isValidDockerImageName } from "../docker-validation";

export const SECURITY_SETTING_KEYS = [
  "containerImage",
  "basePath",
  "claudeSkipPermissions",
  "mountRoot",
] as const;

export type SecuritySettingKey = (typeof SECURITY_SETTING_KEYS)[number];

/** Keys a user may set on their own row (when not locked). */
export const USER_EDITABLE_KEYS: readonly SecuritySettingKey[] = [
  "containerImage",
  "basePath",
  "claudeSkipPermissions",
];

export interface SecuritySettings {
  containerImage?: string;
  basePath?: string;
  claudeSkipPermissions?: boolean;
  mountRoot?: string;
}

export interface SettingsPolicy {
  defaults: SecuritySettings;
  locks: SecuritySettingKey[];
}

export interface EffectiveSettings {
  settings: SecuritySettings;
  /** Keys the terminal server must force (the user's value is ignored). */
  locked: SecuritySettingKey[];
}

export const EMPTY_POLICY: SettingsPolicy = Object.freeze({
  defaults: {},
  locks: [],
}) as SettingsPolicy;

const MAX_PATH = 512;

function isSafeWorkspacePath(v: string): boolean {
  return (
    v.length > 0 &&
    v.length <= MAX_PATH &&
    (v.startsWith("/") || v === "~" || v.startsWith("~/")) &&
    !v.includes("..") &&
    !v.includes("\0") &&
    !v.includes("//")
  );
}

function isSafeRelativePath(v: string): boolean {
  return (
    v.length <= MAX_PATH &&
    !v.startsWith("/") &&
    !v.startsWith("~") &&
    !v.includes("..") &&
    !v.includes("\0") &&
    !v.includes("\\") &&
    /^[A-Za-z0-9._/-]*$/.test(v)
  );
}

export type SanitizeResult =
  | { ok: true; value: SecuritySettings }
  | { ok: false; error: string };

/**
 * Validate an untrusted settings object. Only `allowedKeys` are accepted; an
 * unknown or disallowed key is an error (not silently dropped) so a client
 * cannot believe it set something it did not. `null` clears a key.
 */
export function sanitizeSecuritySettings(
  input: unknown,
  allowedKeys: readonly SecuritySettingKey[],
): SanitizeResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "settings must be an object" };
  }
  const out: SecuritySettings = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKeys.includes(key as SecuritySettingKey)) {
      return { ok: false, error: `setting not allowed: ${key}` };
    }
    if (raw === null || raw === undefined) continue;
    switch (key as SecuritySettingKey) {
      case "containerImage":
        if (typeof raw !== "string" || !isValidDockerImageName(raw)) {
          return { ok: false, error: "invalid containerImage" };
        }
        out.containerImage = raw;
        break;
      case "basePath":
        if (typeof raw !== "string" || !isSafeWorkspacePath(raw)) {
          return { ok: false, error: "invalid basePath" };
        }
        out.basePath = raw;
        break;
      case "claudeSkipPermissions":
        if (typeof raw !== "boolean") {
          return { ok: false, error: "invalid claudeSkipPermissions" };
        }
        out.claudeSkipPermissions = raw;
        break;
      case "mountRoot": {
        if (typeof raw !== "string" || !isSafeRelativePath(raw)) {
          return { ok: false, error: "invalid mountRoot" };
        }
        const trimmed = raw.replace(/\/+$/, "");
        if (trimmed) out.mountRoot = trimmed;
        break;
      }
    }
  }
  return { ok: true, value: out };
}

/** Validate an untrusted locks list. */
export function sanitizeLocks(
  input: unknown,
): { ok: true; value: SecuritySettingKey[] } | { ok: false; error: string } {
  if (!Array.isArray(input))
    return { ok: false, error: "locks must be a list" };
  const out = new Set<SecuritySettingKey>();
  for (const k of input) {
    if (!SECURITY_SETTING_KEYS.includes(k as SecuritySettingKey)) {
      return { ok: false, error: `unknown lock: ${String(k)}` };
    }
    out.add(k as SecuritySettingKey);
  }
  return { ok: true, value: [...out].sort() };
}

/**
 * Effective settings for one user. Values read back from storage are
 * re-validated (a hand-edited DB row cannot inject an unsafe value).
 */
export function resolveEffectiveSettings(
  policy: SettingsPolicy,
  userSettings: unknown = {},
  adminOverrides: unknown = {},
): EffectiveSettings {
  const clean = (v: unknown, keys: readonly SecuritySettingKey[]) => {
    const r = sanitizeSecuritySettings(v ?? {}, keys);
    return r.ok ? r.value : {};
  };
  const defaults = clean(policy.defaults, SECURITY_SETTING_KEYS);
  const user = clean(userSettings, USER_EDITABLE_KEYS);
  const overrides = clean(adminOverrides, SECURITY_SETTING_KEYS);
  const locks = new Set<SecuritySettingKey>(policy.locks);
  // mountRoot is never user-editable, so it is always effectively locked.
  locks.add("mountRoot");

  const settings: SecuritySettings = {};
  for (const key of SECURITY_SETTING_KEYS) {
    const value =
      overrides[key] ??
      (locks.has(key) ? defaults[key] : (user[key] ?? defaults[key]));
    if (value !== undefined) {
      (settings as Record<string, unknown>)[key] = value;
    }
  }
  // Report a key as locked only when there is a value to force.
  const locked = SECURITY_SETTING_KEYS.filter(
    (k) =>
      settings[k] !== undefined && (locks.has(k) || overrides[k] !== undefined),
  );
  return { settings, locked };
}
