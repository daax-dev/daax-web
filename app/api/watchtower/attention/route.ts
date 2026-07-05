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
 * Scaling / load control:
 *  - Sessions are capped server-side (MAX_SESSIONS); truncation is flagged in
 *    the response (`truncated:true`) and logged — never silently dropped.
 *  - The incoming request's AbortSignal is threaded into every Watchtower fetch
 *    (combined with a sub-poll-interval timeout), so a client disconnect or a
 *    re-poll cancels the prior handler's in-flight work instead of letting
 *    overlapping executions stack up.
 *  - A short-TTL cache (lib/attention/cache.ts) coalesces rapid re-polls
 *    (e.g. several tabs) so the fleet is not re-scanned on every hit.
 *
 * Tool history is still fetched per session per poll (Watchtower's tools
 * endpoint exposes no limit/range param); the derivation and sparkline only use
 * recent activity, and each response is bounded and garbage-collected.
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
import { getFresh, store as storeCache } from "@/lib/attention/cache";

/** Bound concurrent per-session tool fetches so a large fleet can't fan out unbounded. */
const TOOLS_FETCH_CONCURRENCY = 6;

/** Hard cap on sessions processed per request; excess is truncated + flagged. */
const MAX_SESSIONS = 100;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: AttentionResponse) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    const authRes = auth.response.clone();
    authRes.headers.set("Cache-Control", "no-store");
    return authRes;
  }

  // Coalesce rapid re-polls (multiple tabs / faster-than-compute polling).
  const cached = getFresh(Date.now());
  if (cached) return json(cached);

  // Client already gone — do no upstream work.
  if (req.signal.aborted) {
    return json({ ok: false, sessions: [], truncated: false });
  }

  const baseUrl = watchtowerBaseUrl();
  const { reachable, sessions } = await fetchActiveSessions(
    baseUrl,
    req.signal,
  );

  if (!reachable) {
    // Not cached: a disconnected/slow upstream should recover on the next poll.
    return json({ ok: false, sessions: [], truncated: false });
  }

  const truncated = sessions.length > MAX_SESSIONS;
  const capped = truncated ? sessions.slice(0, MAX_SESSIONS) : sessions;
  if (truncated) {
    console.warn(
      `[attention] ${sessions.length} active sessions exceed cap ${MAX_SESSIONS}; truncating`,
    );
  }

  const now = Date.now();
  const cards = await mapPool(
    capped,
    TOOLS_FETCH_CONCURRENCY,
    async (session) => {
      // Non-poisoning: one session's tool fetch failing (or aborting) must not
      // sink the whole batch — fall back to a tools-less card so the healthy
      // sessions still render. (fetchSessionTools already fails soft to []; this
      // is belt-and-braces against any future throw.)
      try {
        const tools = await fetchSessionTools(session.id, baseUrl, req.signal);
        return buildCard(session, tools, { now });
      } catch (err) {
        console.warn(`[attention] tool fetch failed for ${session.id}:`, err);
        return buildCard(session, [], { now });
      }
    },
  );

  const body: AttentionResponse = { ok: true, sessions: cards, truncated };
  // Only cache a result computed to completion. If the client aborted mid-flight
  // the per-session fetches degrade to empty tools; caching that would let a
  // fresh poll within the TTL serve a partial/degraded board.
  if (!req.signal.aborted) storeCache(Date.now(), body);
  return json(body);
}
