/**
 * Pure adapter: Watchtower REST data → Attention board card model (issue #153).
 *
 * Kept free of React and I/O so it can be unit-tested. The route handler
 * (app/api/watchtower/attention/route.ts) fetches raw sessions + tools from the
 * Watchtower proxy and calls into here to build the derived, glanceable model.
 *
 * NOTE ON THE 🟡 "waiting-for-input" STATE: this REST adapter still cannot source
 * Notification events — Watchtower persists them but exposes no REST endpoint to
 * read them (only sessions/prompts/tools are queryable). The 🟡 state IS now
 * surfaced at runtime, though: once the live `/ws` bridge connects, the reducer
 * in lib/attention/live.ts applies `notification`/`permission_request` deltas
 * that transition a card to `waiting`. The remaining limitation is replay/seeding
 * — a session already waiting BEFORE the socket connects won't show 🟡 until it
 * emits a new event or the REST snapshot resyncs (a `/api/sessions/{id}/events`
 * endpoint would let the snapshot seed pre-existing waiting state). See PR body.
 */

import {
  deriveStatus,
  type AttentionEvent,
  type DerivedStatus,
  type DeriveOptions,
} from "./status";
import { bucketTimestamps, type BucketOptions } from "./sparkline";

/** Minimal session shape consumed from Watchtower's REST session model. */
export interface RestSession {
  id: string;
  host?: string;
  working_dir?: string;
  git_branch?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  ended_at?: string | null;
}

/** Minimal tool-call shape (subset of the Watchtower tool proxy output). */
export interface RestTool {
  /** Epoch ms start time. */
  startedAt: number;
  name?: unknown;
  error?: string | null;
  durationMs?: number | null;
}

export interface AttentionCard {
  id: string;
  /** Short human label — host, else a truncated id. */
  label: string;
  host: string;
  cwd: string;
  /** Git branch when the session is a repo, else null. */
  repoBranch: string | null;
  status: DerivedStatus["status"];
  /** Epoch ms the current status began (for time-in-state), or null. */
  since: number | null;
  /** Most recent tool name, or null when no tools recorded. */
  lastTool: string | null;
  toolCount: number;
  /** Activity buckets (oldest-first) for the sparkline. */
  sparkline: number[];
}

/**
 * Shape returned by GET /api/watchtower/attention. Declared here (not in the
 * route module) so the client hook can import it as a type without pulling a
 * server route into the client bundle. `ok:false` signals Watchtower was
 * unreachable (disconnected state), distinct from an empty `sessions` list.
 */
export interface AttentionResponse {
  ok: boolean;
  sessions: AttentionCard[];
  /**
   * True when the active-session list exceeded the server cap and was
   * truncated, so the UI can surface that not every session is shown (no silent
   * cap). Absent/false means the full set is present.
   */
  truncated?: boolean;
}

/** Parses an RFC-3339 timestamp to epoch ms, or null if unusable. */
function parseMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Builds the abstract event timeline for a session from its REST records.
 * Exported for direct unit testing of the mapping (independent of the fetch).
 */
export function buildEvents(
  session: RestSession,
  tools: readonly RestTool[],
): AttentionEvent[] {
  const events: AttentionEvent[] = [];

  const startMs = parseMs(session.created_at);
  if (startMs !== null) events.push({ type: "session_start", at: startMs });

  for (const t of tools) {
    if (!Number.isFinite(t.startedAt)) continue;
    const hasError = t.error != null && t.error !== "";
    events.push({
      type: hasError ? "tool_error" : "tool_post",
      at: t.startedAt,
    });
  }

  // Session end: `active === false` marks a terminated session. Prefer the
  // explicit ended_at, falling back to updated_at, then created_at.
  if (session.active === false) {
    const endMs =
      parseMs(session.ended_at) ?? parseMs(session.updated_at) ?? startMs;
    if (endMs !== null) events.push({ type: "session_end", at: endMs });
  }

  return events;
}

export interface BuildCardOptions {
  now: number;
  derive?: DeriveOptions;
  sparkline?: BucketOptions;
}

/** Derives a single Attention card from a session and its tool calls. */
export function buildCard(
  session: RestSession,
  tools: readonly RestTool[],
  opts: BuildCardOptions,
): AttentionCard {
  // Clamp future (clock-skewed) tool timestamps to `now` so status and
  // sparkline stay consistent: without this a skewed agent could read as
  // "working" (status treats at>now as recent) while the sparkline — which
  // drops ts>now — renders empty and the age shows "—". Clamping keeps all
  // three in agreement (working, populated sparkline, ~0s age).
  const normalized: RestTool[] = tools.map((t) =>
    Number.isFinite(t.startedAt) && t.startedAt > opts.now
      ? { ...t, startedAt: opts.now }
      : t,
  );

  const events = buildEvents(session, normalized);
  const derived = deriveStatus(events, opts.now, opts.derive);

  const toolTimestamps = normalized
    .map((t) => t.startedAt)
    .filter((n) => Number.isFinite(n));
  const sparkline = bucketTimestamps(toolTimestamps, opts.now, opts.sparkline);

  // Last tool by start time (tools are typically pre-sorted ascending, but do
  // not assume it).
  let last: RestTool | null = null;
  for (const t of normalized) {
    if (!Number.isFinite(t.startedAt)) continue;
    if (last === null || t.startedAt >= last.startedAt) last = t;
  }
  const lastTool =
    last && typeof last.name === "string" && last.name.length > 0
      ? last.name
      : last
        ? String(last.name ?? "tool")
        : null;

  const host = session.host?.trim() || "";
  const label = host || `${session.id.slice(0, 8)}`;

  return {
    id: session.id,
    label,
    host,
    cwd: session.working_dir?.trim() || "",
    repoBranch: session.git_branch?.trim() || null,
    status: derived.status,
    since: derived.since,
    lastTool,
    toolCount: toolTimestamps.length,
    sparkline,
  };
}
