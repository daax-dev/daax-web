/** Agent View: payload-free GETs and one declared POST signal (ADR 0026).
 * Identity assertions are sent on the POST only; GETs remain Accept-only.
 */

import { NextResponse } from "next/server";
import { deriveAuthContext } from "@/lib/auth-trust";
import { requireAuth } from "@/lib/auth";
import {
  agentviewDaemonUrl,
  fetchDaemon,
  postDaemonSignal,
  SignalConfigurationError,
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
      ...(path === "node"
        ? {
            "X-Agentview-Terminal-Local": process.env.HOST_WORKSPACE_PATH
              ? "0"
              : "1",
          }
        : {}),
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

export async function POST(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    const res = auth.response.clone();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  // Next decodes catch-all parameters, including slashes within an encoded ID.
  // Encode the parameter slot again before applying the same path validator.
  const { path: segments } = await context.params;
  const encoded =
    segments?.map((part, i) => (i === 1 ? encodeURIComponent(part) : part)) ??
    [];
  if (!resolveDaemonPath(encoded, "POST"))
    return NextResponse.json(
      { error: "method not allowed" },
      { status: 405, headers: NO_STORE_HEADERS },
    );
  const { subject } = deriveAuthContext(req.headers);
  if (!subject)
    return NextResponse.json(
      {
        error: "cannot break in",
        reason:
          "daax trusted the local operator without a name, and the daemon records a signal against a person",
      },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  try {
    const upstream = await postDaemonSignal(segments[1], await req.text(), {
      subject,
      // Request has no socket peer in Next. Never trust a caller's forwarding
      // header as a socket address; use the ADR's explicit loopback fallback.
      peerAddress: "127.0.0.1",
    });
    if (!upstream.ok)
      return NextResponse.json(
        { error: "agentview daemon unreachable", reason: upstream.message },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    return new Response(upstream.res.body, {
      status: upstream.res.status,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type":
          upstream.res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    if (!(err instanceof SignalConfigurationError)) throw err;
    return NextResponse.json(
      { error: "cannot break in", reason: err.message },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
