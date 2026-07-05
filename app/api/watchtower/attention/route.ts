/**
 * GET /api/watchtower/attention  (issue #153)
 *
 * Aggregation endpoint powering the Attention board. In one request it:
 *   1. lists active Watchtower sessions,
 *   2. fetches each session's tool calls (bounded fan-out),
 *   3. derives a glanceable status + activity sparkline per session.
 *
 * Auth: requireAuth() runs first — session tool data can contain prompts,
 * command output and file contents. Unauthenticated requests get the 401 from
 * the auth layer before any Watchtower communication.
 *
 * Failure semantics: transport failures never throw. The response always uses
 * HTTP 200 (post-auth) and carries `ok` — `false` means Watchtower was
 * unreachable, which the UI renders as a disconnected state (distinct from an
 * empty board of zero sessions).
 *
 * Scope note: this queries Watchtower's ACTIVE sessions (the board is about
 * what needs attention now). A session that ends leaves that list, so the ✅
 * done state is only surfaced transiently — for a session that terminates while
 * displayed (the derivation fully supports/tests `done`). Switching to the full
 * `/api/sessions` list would keep historical done sessions on the board, which
 * would be noise for an attention view.
 *
 * Scaling note: tool history is fetched per session per poll. The sparkline and
 * status only need recent activity, but Watchtower's tools endpoint exposes no
 * limit/range param, so the full list is transferred each time (bounded per
 * request, garbage-collected — not a leak). A bounded/recent-tools Watchtower
 * endpoint would reduce transfer for very long-lived sessions.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { mapPool } from "@/lib/concurrency";
import {
  fetchActiveSessions,
  fetchSessionTools,
  watchtowerBaseUrl,
} from "@/lib/watchtower/client";
import { buildCard, type AttentionResponse } from "@/lib/attention/adapter";

/** Bound concurrent per-session tool fetches so a large fleet can't fan out unbounded. */
const TOOLS_FETCH_CONCURRENCY = 6;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    const authRes = auth.response.clone ? auth.response.clone() : auth.response;
    authRes.headers.set("Cache-Control", "no-store");
    return authRes;
  }

  const baseUrl = watchtowerBaseUrl();
  const { reachable, sessions } = await fetchActiveSessions(baseUrl);

  if (!reachable) {
    return NextResponse.json(
      { ok: false, sessions: [] } satisfies AttentionResponse,
      { headers: NO_STORE_HEADERS },
    );
  }

  const now = Date.now();
  const cards = await mapPool(
    sessions,
    TOOLS_FETCH_CONCURRENCY,
    async (session) => {
      const tools = await fetchSessionTools(session.id, baseUrl);
      return buildCard(session, tools, { now });
    },
  );

  return NextResponse.json(
    { ok: true, sessions: cards } satisfies AttentionResponse,
    { headers: NO_STORE_HEADERS },
  );
}
