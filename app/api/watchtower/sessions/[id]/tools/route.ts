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

const WATCHTOWER_API_URL =
  process.env.WATCHTOWER_API_URL ?? "http://localhost:4220";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const res = await fetch(
      `${WATCHTOWER_API_URL}/api/sessions/${encodeURIComponent(id)}/tools`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      console.warn(
        `[watchtower-proxy] /api/sessions/${id}/tools → HTTP ${res.status}`,
      );
      return NextResponse.json({ tools: [] });
    }

    const raw: unknown = await res.json();
    const list: WatchtowerTool[] = Array.isArray(raw) ? raw : [];

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

    return NextResponse.json({ tools });
  } catch (err) {
    console.warn("[watchtower-proxy] fetch failed:", err);
    return NextResponse.json({ tools: [] });
  }
}
