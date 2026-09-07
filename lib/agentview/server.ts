/**
 * Server-only helpers for the Agent View proxy (`GET /api/agentview/[...path]`).
 *
 * The dist-agent daemon (`agentd`) is loopback-only by default: it pins the
 * `Host` header, has no CORS headers, and answers 401/403 when it refuses. A
 * browser at :4200 therefore cannot read it directly, so the daax server does —
 * and this module is the whole of what that server-side hop is allowed to do:
 *
 *   - `agentviewDaemonUrl()`   where the daemon is, by deployment mode;
 *   - `resolveDaemonPath()`    which routes may be forwarded at all;
 *   - `fetchDaemon()`          one bounded fetch with fail-soft transport errors.
 *
 * The env/host resolution mirrors the Watchtower client (lib/watchtower/client.ts):
 * an explicit AGENTVIEW_DAEMON_URL always wins; in container mode
 * (HOST_WORKSPACE_PATH set) reach the host through host.docker.internal, which
 * docker-compose wires via `extra_hosts`; otherwise loopback for host-dev.
 */

import "server-only";

/** The daemon's default listen address (dist-agent `agentd --listen`). */
const DEFAULT_PORT = 7717;

export function agentviewDaemonUrl(): string {
  const explicit = process.env.AGENTVIEW_DAEMON_URL?.trim();
  const fallback = process.env.HOST_WORKSPACE_PATH
    ? `http://host.docker.internal:${DEFAULT_PORT}`
    : `http://127.0.0.1:${DEFAULT_PORT}`;
  const url = explicit || fallback;
  return url.replace(/\/+$/, "");
}

/**
 * One path segment that is *not* a path parameter: a fixed route word. The
 * daemon's route table uses lowercase ASCII words only.
 */
const WORD = /^[a-z]+$/;

/**
 * One path parameter as the browser sends it: a single segment, percent-encoded
 * by the caller. Agent ids are `node/type/session`, so an id arrives as
 * `node%2Ftype%2Fsession` and MUST stay encoded on the way out — the daemon's
 * mux matches `{id}` against one segment and an unencoded slash would fall
 * through to its catch-all. The character class admits what a URL segment may
 * carry; a literal `/`, `?`, `#`, or `..` never reaches the daemon.
 */
const PARAM = /^[A-Za-z0-9._~%-]+$/;

/** A parameter that decodes to `..` or `.` is a traversal attempt, not an id. */
function isTraversal(segment: string): boolean {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return true;
  }
  return (
    decoded === ".." ||
    decoded === "." ||
    decoded.split("/").some((part) => part === ".." || part === ".")
  );
}

/**
 * The allow-list, as an ordered table of segment matchers. Each entry is the
 * exact shape of one admitted daemon route; `"{id}"` marks a parameter slot.
 *
 * What is deliberately absent, and why: `prompts`, `agents/{id}/prompt`,
 * `agents/{id}/conversation`, `agents/{id}/sent` and `worktrees/{id}/diff[/file]`
 * carry raw prompts or file contents (dist-agent ADR 0001/0014); `settings`,
 * `auth/*` and `agents/{id}/signal` are writes or credentials; `build/sbom`,
 * `repositories` and `worktrees/{id}/reconcile` are simply not needed by the
 * tab's first cut. A route is added here by an argument, not by a fallthrough.
 */
export const ALLOWED_PATHS: ReadonlyArray<ReadonlyArray<string>> = [
  ["healthz"],
  ["node"],
  ["nodes"],
  ["build"],
  ["agents"],
  ["agents", "{id}"],
  ["agents", "{id}", "inventory"],
  ["events"],
  ["events", "{id}"],
  ["events", "{id}", "causal"],
  ["projects"],
  ["worktrees"],
  ["stream"],
];

/**
 * Maps the proxy's catch-all segments to the daemon path they may become, or
 * `null` when the route is not admitted. The returned path is relative to the
 * daemon's `/api/v1/` prefix and keeps every parameter exactly as encoded.
 */
export function resolveDaemonPath(segments: string[]): string | null {
  if (segments.length === 0) return null;
  for (const shape of ALLOWED_PATHS) {
    if (shape.length !== segments.length) continue;
    let matched = true;
    for (let i = 0; i < shape.length; i++) {
      const want = shape[i];
      const got = segments[i];
      if (want === "{id}") {
        if (!PARAM.test(got) || isTraversal(got)) {
          matched = false;
          break;
        }
      } else if (got !== want || !WORD.test(got)) {
        matched = false;
        break;
      }
    }
    if (matched) return segments.join("/");
  }
  return null;
}

/** Max ms to wait for the daemon to *answer*; the stream body is unbounded. */
export const DAEMON_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Combines an optional caller signal (the incoming request's, so a client
 * disconnect cancels the upstream fetch) with a fresh timeout into one signal.
 * Returns a `cleanup` that MUST run once the headers have arrived. It clears
 * the timer and deliberately leaves the caller's abort attached, so a
 * streaming body still stops when the browser goes away; the caller's signal
 * is per-request, so the listener dies with it.
 */
export function withTimeout(
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

  const cleanup = () => clearTimeout(timer);
  return { signal: controller.signal, cleanup };
}

export type DaemonFetchResult =
  | { ok: true; res: Response }
  | { ok: false; kind: "unreachable"; message: string };

export interface FetchDaemonOptions {
  /** Raw query string without the leading `?`; forwarded verbatim. */
  query?: string;
  /** The incoming request's signal, so a disconnect aborts the upstream. */
  signal?: AbortSignal;
  /** `application/json` unless the caller wants the SSE stream. */
  accept?: "application/json" | "text/event-stream";
}

/**
 * One GET to the daemon. Sends only an `Accept` header — never the daax
 * session cookie, never any incoming header — because the daemon's session is
 * the operator's, not the browser's, and a proxied cookie would be a confused
 * deputy. Transport failures (refused connection, DNS, the 5 s connect
 * timeout, a caller abort) resolve to `{ ok:false, kind:"unreachable" }`; an
 * HTTP answer of any status is `{ ok:true, res }` for the caller to interpret.
 *
 * The timeout covers headers only. Once `res` resolves the timer is cleared,
 * so a long-lived SSE body is never cut by it; the caller's own signal still
 * aborts it.
 */
export async function fetchDaemon(
  path: string,
  { query, signal, accept = "application/json" }: FetchDaemonOptions = {},
): Promise<DaemonFetchResult> {
  const base = agentviewDaemonUrl();
  const url = `${base}/api/v1/${path}${query ? `?${query}` : ""}`;
  const { signal: combined, cleanup } = withTimeout(
    signal,
    DAEMON_CONNECT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: accept },
      signal: combined,
      redirect: "manual",
    });
    return { ok: true, res };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? signal?.aborted
          ? "request aborted by the caller"
          : `no answer within ${DAEMON_CONNECT_TIMEOUT_MS} ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, kind: "unreachable", message };
  } finally {
    cleanup();
  }
}
