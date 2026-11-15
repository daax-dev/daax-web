/**
 * Browser-side sync of the server-held security settings (dx#119).
 *
 * The server (Postgres, per user) is the authority for `containerImage`,
 * `basePath` and `claudeSkipPermissions`; the terminal server enforces the
 * admin-locked ones from the signed WS ticket. localStorage keeps a cache so
 * the existing synchronous `getSettings()` callers keep working. Every other
 * setting is a pure UI preference and stays in localStorage only.
 *
 * Client-safe: no server imports.
 */
import { getSettings, saveSettings, type DaaxSettings } from "./settings";

export const SERVER_SECURITY_KEYS = [
  "containerImage",
  "basePath",
  "claudeSkipPermissions",
] as const;

export type ServerSecurityKey = (typeof SERVER_SECURITY_KEYS)[number];

export interface ServerSettingsState {
  /** False for the local operator / when the server holds no settings. */
  serverSide: boolean;
  /** Keys an admin locked; the UI shows them read-only. */
  locked: string[];
}

const NONE: ServerSettingsState = { serverSide: false, locked: [] };

function pick(src: Record<string, unknown>): Partial<DaaxSettings> {
  const out: Record<string, unknown> = {};
  for (const k of SERVER_SECURITY_KEYS) {
    if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  }
  return out as Partial<DaaxSettings>;
}

/**
 * Pull the effective server values into the localStorage cache. Network or
 * server errors leave the cache as it is (the terminal still enforces locks).
 */
export async function loadServerSecuritySettings(): Promise<ServerSettingsState> {
  try {
    const res = await fetch("/api/settings/user", { cache: "no-store" });
    if (!res.ok) return NONE;
    const body = await res.json();
    if (!body?.serverSide) return NONE;
    const values = pick(body.settings ?? {});
    if (Object.keys(values).length > 0) saveSettings(values);
    return {
      serverSide: true,
      locked: Array.isArray(body.locked) ? body.locked : [],
    };
  } catch {
    return NONE;
  }
}

/** Push the caller's own (unlocked) security values to the server. */
export async function saveServerSecuritySettings(
  state: ServerSettingsState,
  settings: DaaxSettings = getSettings(),
): Promise<{ ok: boolean; error?: string }> {
  if (!state.serverSide) return { ok: true };
  const body: Record<string, unknown> = {};
  for (const k of SERVER_SECURITY_KEYS) {
    if (!state.locked.includes(k)) body[k] = settings[k];
  }
  try {
    const res = await fetch("/api/settings/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: body }),
    });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err?.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
