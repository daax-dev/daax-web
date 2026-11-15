/**
 * Postgres persistence for server-side security settings (dx#119).
 * Schema: migrations/1781568000500_tenant-settings.js.
 */
import { query } from "@/lib/db/pg";
import {
  EMPTY_POLICY,
  resolveEffectiveSettings,
  sanitizeLocks,
  sanitizeSecuritySettings,
  SECURITY_SETTING_KEYS,
  type EffectiveSettings,
  type SecuritySettings,
  type SecuritySettingKey,
  type SettingsPolicy,
} from "./settings-policy";

export async function getPolicy(): Promise<SettingsPolicy> {
  const r = await query<{ defaults: unknown; locks: string[] }>(
    "SELECT defaults, locks FROM settings_policy WHERE id = 1",
  );
  const row = r.rows[0];
  if (!row) return EMPTY_POLICY;
  const d = sanitizeSecuritySettings(row.defaults ?? {}, SECURITY_SETTING_KEYS);
  const l = sanitizeLocks(row.locks ?? []);
  return { defaults: d.ok ? d.value : {}, locks: l.ok ? l.value : [] };
}

export async function setPolicy(
  policy: SettingsPolicy,
  updatedBy: string | null,
): Promise<void> {
  await query(
    `INSERT INTO settings_policy (id, defaults, locks, updated_by, updated_at)
       VALUES (1, $1::jsonb, $2::text[], $3, now())
     ON CONFLICT (id) DO UPDATE
       SET defaults = EXCLUDED.defaults, locks = EXCLUDED.locks,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(policy.defaults), policy.locks, updatedBy],
  );
}

export interface UserSettingsRow {
  settings: SecuritySettings;
  adminOverrides: SecuritySettings;
}

export async function getUserSettings(
  subject: string,
): Promise<UserSettingsRow> {
  const r = await query<{ settings: unknown; admin_overrides: unknown }>(
    "SELECT settings, admin_overrides FROM user_settings WHERE subject = $1",
    [subject],
  );
  const row = r.rows[0];
  const s = sanitizeSecuritySettings(
    row?.settings ?? {},
    SECURITY_SETTING_KEYS,
  );
  const o = sanitizeSecuritySettings(
    row?.admin_overrides ?? {},
    SECURITY_SETTING_KEYS,
  );
  return {
    settings: s.ok ? s.value : {},
    adminOverrides: o.ok ? o.value : {},
  };
}

/** Replace the user's own settings (caller has validated the keys). */
export async function setUserSettings(
  subject: string,
  settings: SecuritySettings,
): Promise<void> {
  await query(
    `INSERT INTO user_settings (subject, settings, updated_at)
       VALUES ($1, $2::jsonb, now())
     ON CONFLICT (subject) DO UPDATE
       SET settings = EXCLUDED.settings, updated_at = now()`,
    [subject, JSON.stringify(settings)],
  );
}

/** Replace an admin's per-user overrides for `subject`. */
export async function setUserOverrides(
  subject: string,
  overrides: SecuritySettings,
): Promise<void> {
  await query(
    `INSERT INTO user_settings (subject, admin_overrides, updated_at)
       VALUES ($1, $2::jsonb, now())
     ON CONFLICT (subject) DO UPDATE
       SET admin_overrides = EXCLUDED.admin_overrides, updated_at = now()`,
    [subject, JSON.stringify(overrides)],
  );
}

/** Effective settings for a subject (policy + own row). */
export async function getEffectiveSettings(
  subject: string,
): Promise<EffectiveSettings> {
  const [policy, row] = await Promise.all([
    getPolicy(),
    getUserSettings(subject),
  ]);
  return resolveEffectiveSettings(policy, row.settings, row.adminOverrides);
}

export type { SecuritySettingKey };
