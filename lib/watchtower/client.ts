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
 * Max ms to wait for Watchtower before aborting a single request. This bounds
 * each fetch, not the whole aggregation: the attention handler runs a sessions
 * fetch plus batched per-session tool fetches, so its end-to-end time can
 * exceed the board's 2s poll interval. Overlap is prevented elsewhere — the
 * client hook skips a tick while a request is in flight, and the server TTL
 * cache amortizes a completed slow scan across polls.
 *
 * Deliberately shorter than the 5s used by the one-shot tools proxy
 * (app/api/watchtower/sessions/[id]/tools/route.ts). That proxy answers a single
 * user-triggered request where a longer wait is acceptable; the attention board
 * polls on a ~2s cadence, so this timeout is kept BELOW that interval to stay
 * responsive and livelock-safe. A per-fetch timeout longer than the poll cadence
 * could let a slow scan straddle multiple ticks; the shorter bound plus the
 * in-flight single-flight guard keep each poll bounded well under the cadence. Do
 * not raise this to 5s without re-checking the poll interval — the difference is
 * intentional, not drift.
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

/** Returns the value when it is a string, else undefined (drops schema drift). */
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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
        // Coerce optional fields: drop anything non-string so upstream schema
        // drift (e.g. a numeric host) can't leak non-string values into the
        // adapter, which calls string methods on them.
        sessions.push({
          id: s.id,
          host: asString(s.host),
          working_dir: asString(s.working_dir),
          git_branch: asString(s.git_branch),
          active: typeof s.active === "boolean" ? s.active : undefined,
          created_at: asString(s.created_at),
          updated_at: asString(s.updated_at),
          ended_at: s.ended_at === null ? null : asString(s.ended_at),
        });
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
