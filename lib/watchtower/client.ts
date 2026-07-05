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

/**
 * Max ms to wait for Watchtower before aborting a request. Deliberately below
 * the board's 2s poll interval so a slow upstream can't keep a handler running
 * past the point the client has already re-polled (avoids overlapping
 * executions stacking up server-side).
 */
const FETCH_TIMEOUT_MS = 1_500;

export function watchtowerBaseUrl(): string {
  const fallback = process.env.HOST_WORKSPACE_PATH
    ? "http://host.docker.internal:4220"
    : "http://localhost:4220";
  return process.env.WATCHTOWER_API_URL ?? fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Combines an optional caller signal (e.g. the incoming request's AbortSignal,
 * so a client disconnect cancels in-flight server work) with a fresh timeout
 * into a single signal. Returns a `cleanup` that MUST run in `finally` to clear
 * the timer and detach the listener — otherwise a long-lived caller signal
 * would accumulate listeners/timers (leak). Scoped per call: it never aborts
 * anything beyond this request's own fetch.
 */
function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(onAbort, timeoutMs);

  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }

  const cleanup = () => {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  };
  return { signal: controller.signal, cleanup };
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
  external?: AbortSignal,
): Promise<ActiveSessionsResult> {
  const { signal, cleanup } = withTimeout(external, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/sessions/active`, {
      cache: "no-store",
      signal,
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
  } finally {
    cleanup();
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
  external?: AbortSignal,
): Promise<RestTool[]> {
  const { signal, cleanup } = withTimeout(external, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${baseUrl}/api/sessions/${encodeURIComponent(id)}/tools`,
      { cache: "no-store", signal },
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
  } finally {
    cleanup();
  }
}
