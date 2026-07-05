/**
 * Server-only Watchtower REST client helpers (issue #153).
 *
 * Centralises the base-URL resolution and the two reads the Attention board
 * needs — active sessions and per-session tool calls — with fail-soft
 * semantics: a `reachable` flag distinguishes "Watchtower is down" from "no
 * sessions", which the UI needs to show a disconnected state vs. an empty one.
 *
 * The env/host resolution mirrors the existing tool proxy
 * (app/api/watchtower/sessions/[id]/tools/route.ts): explicit WATCHTOWER_API_URL
 * always wins; in container mode (HOST_WORKSPACE_PATH set) reach the host via
 * host.docker.internal; otherwise localhost for host-dev.
 */

import type { RestSession, RestTool } from "@/lib/attention/adapter";

/** Max ms to wait for Watchtower before aborting a request. */
const FETCH_TIMEOUT_MS = 5_000;

export function watchtowerBaseUrl(): string {
  const fallback = process.env.HOST_WORKSPACE_PATH
    ? "http://host.docker.internal:4220"
    : "http://localhost:4220";
  return process.env.WATCHTOWER_API_URL ?? fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export interface ActiveSessionsResult {
  reachable: boolean;
  sessions: RestSession[];
}

/**
 * GET Watchtower /api/sessions/active. Returns `{ reachable:false, sessions:[] }`
 * on any transport/parse failure so callers degrade gracefully.
 */
export async function fetchActiveSessions(
  baseUrl: string = watchtowerBaseUrl(),
): Promise<ActiveSessionsResult> {
  try {
    const res = await fetch(`${baseUrl}/api/sessions/active`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[watchtower] /api/sessions/active → HTTP ${res.status}`);
      return { reachable: false, sessions: [] };
    }
    const raw: unknown = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const sessions: RestSession[] = [];
    for (const s of list) {
      if (isPlainObject(s) && typeof s.id === "string" && s.id !== "") {
        sessions.push(s as unknown as RestSession);
      }
    }
    return { reachable: true, sessions };
  } catch (err) {
    console.warn("[watchtower] active sessions fetch failed:", err);
    return { reachable: false, sessions: [] };
  }
}

/** Raw Watchtower tool row shape. */
interface WatchtowerToolRow {
  tool_name?: string;
  error?: string | null;
  duration_ms?: number | null;
  created_at?: string;
}

/**
 * GET Watchtower /api/sessions/:id/tools, mapped to the RestTool shape used by
 * the adapter. Returns `[]` on any failure (never throws).
 */
export async function fetchSessionTools(
  id: string,
  baseUrl: string = watchtowerBaseUrl(),
): Promise<RestTool[]> {
  try {
    const res = await fetch(
      `${baseUrl}/api/sessions/${encodeURIComponent(id)}/tools`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    const list: WatchtowerToolRow[] = Array.isArray(raw)
      ? (raw.filter(isPlainObject) as WatchtowerToolRow[])
      : [];
    return list
      .map((t) => ({
        startedAt: Date.parse(t.created_at ?? ""),
        name: t.tool_name,
        error: t.error ?? null,
        durationMs: t.duration_ms ?? null,
      }))
      .filter((t) => Number.isFinite(t.startedAt));
  } catch (err) {
    console.warn(`[watchtower] tools fetch failed for ${id}:`, err);
    return [];
  }
}
