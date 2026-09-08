/**
 * Proxy route: GET /api/agentview/[...path]
 *
 * The Agent View tab's only way to the dist-agent daemon (`agentd`). The daemon
 * pins its `Host` header to loopback and sends no CORS headers, so a browser at
 * :4200 cannot read it; this route reads it from the daax server instead and
 * hands the JSON back untouched. It is a *reader*: GET only, no body, no
 * headers of the caller's forwarded — the daemon sees `Accept` and nothing
 * else, never the daax session cookie.
 *
 * Auth: requireAuth() is called first; unauthenticated requests receive a 401
 * from the auth layer before the daemon is contacted, with `no-store` set so a
 * cached 401 cannot outlive a sign-in.
 *
 * The allow-list (lib/agentview/server.ts `resolveDaemonPath`) is narrow on
 * purpose. The daemon serves raw prompts, conversations and file diffs
 * (dist-agent ADR 0001/0014) and accepts writes on four routes (settings,
 * session minting, logout, signals). None of those has any business behind a
 * daax proxy in the tab's first cut, and a proxy that forwarded whatever it was
 * asked for would turn a daax session into a daemon session — a confused
 * deputy with the operator's privileges. A route is added by an argument here,
 * never by a wildcard. One narrowing on top of the list: `events/{id}` returns
 * the raw payload unless told not to, so `raw=false` is pinned on it.
 *
 * Failure semantics, each distinguishable by the client (lib/agentview/client.ts):
 *   - unknown route      → 404 { error: "no such agentview route", path }
 *   - daemon 401/403     → same status, { error: "the daemon refused this request",
 *                           upstream_status, detail }
 *   - daemon unreachable → 502 { error: "agentview daemon unreachable", daemon, reason }
 *   - anything else      → the daemon's status and body, passed through.
 *
 * `stream` is forwarded as a live `text/event-stream`: the 5 s timeout bounds
 * the daemon's *answer*, not the body, and the upstream fetch is aborted when
 * the browser goes away.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  agentviewDaemonUrl,
  fetchDaemon,
  resolveDaemonPath,
} from "@/lib/agentview/server";

/** The stream never terminates and must not be pre-rendered or cached. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Shared response headers — live daemon data must never be cached. */
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/** How much of a refusal's body is echoed back; enough to read, never a page. */
const DETAIL_LIMIT = 500;

export async function GET(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    const authRes = auth.response.clone ? auth.response.clone() : auth.response;
    authRes.headers.set("Cache-Control", "no-store");
    return authRes;
  }

  const { path: segments } = await context.params;
  const path = resolveDaemonPath(segments ?? []);
  if (path === null) {
    return NextResponse.json(
      { error: "no such agentview route", path: (segments ?? []).join("/") },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const query = forwardedQuery(path, new URL(req.url).search);
  const isStream = path === "stream";

  const upstream = await fetchDaemon(path, {
    query,
    signal: req.signal,
    accept: isStream ? "text/event-stream" : "application/json",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "agentview daemon unreachable",
        daemon: agentviewDaemonUrl(),
        reason: upstream.message,
      },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  const res = upstream.res;

  if (res.status === 401 || res.status === 403) {
    const detail = (await safeText(res)).slice(0, DETAIL_LIMIT);
    return NextResponse.json(
      {
        error: "the daemon refused this request",
        upstream_status: res.status,
        detail,
      },
      { status: res.status, headers: NO_STORE_HEADERS },
    );
  }

  if (isStream) {
    if (!res.ok || res.body === null) {
      // The daemon answered but not with a stream: surface its status, not an
      // empty event source that reads as "no activity".
      const body = (await safeText(res)).slice(0, DETAIL_LIMIT);
      return NextResponse.json(
        {
          error: "the daemon did not open a stream",
          upstream_status: res.status,
          detail: body,
        },
        {
          status: res.status === 200 ? 502 : res.status,
          headers: NO_STORE_HEADERS,
        },
      );
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Pass the daemon's status and body through byte for byte. It is JSON by
  // contract (protojson), and re-encoding it here would cost the 64-bit
  // strings their exactness for nothing.
  const body = await safeText(res);
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
      ...NO_STORE_HEADERS,
    },
  });
}

/**
 * The query string is forwarded verbatim — the daemon validates `limit`,
 * `descending`, `after_sequence`, `agent_id`, `session_id`, `event_type`,
 * `include_finished`, `include_all_hosts` and answers 400 for what it will not
 * take — with one exception: a single event is served with its raw payload
 * unless `raw=false`, and raw payloads are what this proxy exists not to carry.
 */
function forwardedQuery(path: string, search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (/^events\/[^/]+$/.test(path)) {
    const pinned = new URLSearchParams(raw);
    pinned.set("raw", "false");
    return pinned.toString();
  }
  return raw;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
