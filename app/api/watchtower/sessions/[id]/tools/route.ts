/**
 * Proxy route: GET /api/watchtower/sessions/[id]/tools
 *
 * Fetches tool-call data from the Watchtower REST API and maps it to the
 * ToolCall shape expected by lib/turn-cluster.ts.
 *
 * On any failure (watchtower down, non-200, missing/malformed JSON) this
 * route returns HTTP 200 { tools: [] } — the caller must never receive a
 * 500, so the UI degrades gracefully to an empty timeline.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/** Raw shape returned by GET /api/sessions/:id/tools from Watchtower. */
interface WatchtowerTool {
  id: string;
  session_id: string;
  tool_name: string;
  parameters: unknown;
  result: unknown;
  error: string | null;
  duration_ms: number | null;
  created_at: string; // RFC 3339
}

/**
 * Mapped ToolCall shape consumed by clusterByTurn (lib/turn-cluster).
 *
 * The index signature `[key: string]: unknown` makes this structurally
 * compatible with the `ToolCall` interface in lib/turn-cluster.ts, avoiding
 * the need for unsafe casts at call sites.
 */
export interface SessionToolCall {
  id: string;
  startedAt: number;
  name: string;
  durationMs: number | null;
  parameters: unknown;
  result: unknown;
  error: string | null;
  [key: string]: unknown;
}

// Explicit env always wins. When running in container mode (HOST_WORKSPACE_PATH
// is set by docker:run/compose), use host.docker.internal which is wired via
// the extra_hosts entry in docker-compose.yml. In host-dev mode (no
// HOST_WORKSPACE_PATH), default to localhost so local Watchtower is reachable
// without requiring every developer to set an env var.
const _defaultWatchtowerHost = process.env.HOST_WORKSPACE_PATH
  ? "http://host.docker.internal:4220"
  : "http://localhost:4220";
const WATCHTOWER_API_URL =
  process.env.WATCHTOWER_API_URL ?? _defaultWatchtowerHost;

/** Maximum ms to wait for Watchtower before aborting and returning {tools:[]}. */
const FETCH_TIMEOUT_MS = 5_000;

/** Shared response headers — prevent intermediaries/browsers caching live session data. */
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// SECURITY: GET requires auth — tool-call records can contain prompts, command
// output, file contents, and other sensitive data.
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await context.params;

  try {
    // Use AbortSignal.timeout so a slow/hung Watchtower degrades quickly to
    // {tools:[]} instead of holding the request open indefinitely.
    const res = await fetch(
      `${WATCHTOWER_API_URL}/api/sessions/${encodeURIComponent(id)}/tools`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );

    if (!res.ok) {
      console.warn(
        `[watchtower-proxy] /api/sessions/${id}/tools → HTTP ${res.status}`,
      );
      return NextResponse.json({ tools: [] }, { headers: NO_STORE_HEADERS });
    }

    const raw: unknown = await res.json();
    // Filter to plain-object elements before casting to WatchtowerTool so that
    // null / primitive / array elements in the response don't cause .map() to
    // throw and swallow the rest of the valid rows.
    const list: WatchtowerTool[] = Array.isArray(raw)
      ? (raw.filter(
          (el): el is WatchtowerTool =>
            el !== null && typeof el === "object" && !Array.isArray(el),
        ) as WatchtowerTool[])
      : [];

    const tools: SessionToolCall[] = list
      .map((t) => ({
        id: t.id,
        startedAt: Date.parse(t.created_at),
        name: t.tool_name,
        durationMs: t.duration_ms ?? null,
        parameters: t.parameters,
        result: t.result,
        error: t.error ?? null,
      }))
      // Drop any tool whose created_at failed to parse (Date.parse returns NaN
      // for empty or malformed timestamps). NaN comparators in Array.sort()
      // produce undefined ordering, so we must remove them before sorting.
      .filter((t) => Number.isFinite(t.startedAt))
      // clusterByTurn() requires tools sorted ascending by startedAt.
      // Watchtower returns rows ordered by created_at ASC per the contract,
      // but we sort here defensively to guarantee the precondition regardless
      // of upstream ordering.
      .sort((a, b) => a.startedAt - b.startedAt);

    return NextResponse.json({ tools }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.warn("[watchtower-proxy] fetch failed:", err);
    return NextResponse.json({ tools: [] }, { headers: NO_STORE_HEADERS });
  }
}
