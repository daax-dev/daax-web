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
import { open } from "node:fs/promises";

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
 * The `Host` to present to the daemon, which is NOT always the host we dial.
 *
 * agentd refuses a request whose Host it does not recognise — a DNS-rebinding
 * guard, and a correct one: a name that resolves to the daemon can be pointed
 * there by whoever controls the name, so the daemon answers only to a loopback
 * Host, the address it was told to listen on, or its --public-origin.
 *
 * `host.docker.internal` is none of those, so the container-mode default above
 * dialled the right socket and was refused by name:
 *
 *   403 refused: Host "host.docker.internal:7717" is not this daemon. It
 *   answers only to a loopback Host or the address it was told to listen on
 *   (127.0.0.1:7717) or the origin it was told it is reached at (…)
 *
 * That is the whole reason Agent View showed a dead daemon on every host. The
 * socket was reachable; the name was wrong.
 *
 * So when we are using the container-mode default, send the loopback Host the
 * daemon does accept. We are not guessing: host.docker.internal is by
 * definition the host, and agentd's default listen address is that host's
 * loopback, which is exactly what the guard admits.
 *
 * Returns undefined when AGENTVIEW_DAEMON_URL is set — an operator who named a
 * daemon has also named the Host it should answer to, and silently rewriting it
 * would defeat the guard rather than satisfy it.
 */
export function agentviewDaemonHostHeader(): string | undefined {
  if (process.env.AGENTVIEW_DAEMON_URL?.trim()) return undefined;
  if (!process.env.HOST_WORKSPACE_PATH) return undefined;
  return `127.0.0.1:${DEFAULT_PORT}`;
}

/**
 * One daemon request, sent so the Host above actually survives.
 *
 * `fetch` CANNOT do this. Host is a forbidden header name in the fetch spec, so
 * undici silently drops it and derives Host from the URL — the override looks
 * applied and changes nothing. Measured against the real daemon from inside the
 * container:
 *
 *   fetch + Host header    -> 403   (header dropped, Host is host.docker.internal)
 *   node:http + Host       -> 200
 *
 * So the container-mode path uses node:http, which lets a caller set Host, and
 * everything else keeps using fetch. This is deliberately NOT a wholesale
 * transport swap: when an operator sets AGENTVIEW_DAEMON_URL there is no
 * override to apply, `hostHeader` is undefined, and the original fetch path
 * runs untouched — including TLS, which node:http could not serve anyway.
 *
 * The Response is constructed rather than proxied so callers keep the shape
 * they already use: `.status`, `.ok`, `.text()`, and a real streaming `.body`
 * for the SSE route.
 */
async function daemonRequest(
  url: string,
  init: {
    method?: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const hostHeader = agentviewDaemonHostHeader();
  if (!hostHeader) {
    return fetch(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      redirect: "manual",
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    });
  }

  const { request } = await import("node:http");
  const { Readable } = await import("node:stream");
  const target = new URL(url);

  return new Promise<Response>((resolve, reject) => {
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        // Host LAST so it cannot be shadowed by a caller-supplied entry.
        headers: { ...init.headers, Host: hostHeader },
        signal: init.signal,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) for (const one of v) headers.append(k, one);
          else if (v !== undefined) headers.set(k, v);
        }
        // Through `unknown` on purpose. Readable.toWeb returns node:stream/web's
        // ReadableStream, whose getReader overloads do not structurally match
        // the DOM lib's — the two are the same object at runtime and TypeScript
        // will not accept a direct cast between them.
        const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
        resolve(
          new Response(body, { status: res.statusCode ?? 502, headers }),
        );
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
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
 * `auth/*` are writes or credentials; the one declared POST is signal; `build/sbom`,
 * `repositories` and `worktrees/{id}/reconcile` are simply not needed by the
 * tab's first cut. A route is added here by an argument, not by a fallthrough.
 */
export const ALLOWED_PATHS: ReadonlyArray<{
  method: string;
  shape: readonly string[];
}> = [
  { method: "GET", shape: ["healthz"] },
  { method: "GET", shape: ["node"] },
  { method: "GET", shape: ["nodes"] },
  { method: "GET", shape: ["build"] },
  { method: "GET", shape: ["agents"] },
  { method: "GET", shape: ["agents", "{id}"] },
  { method: "GET", shape: ["agents", "{id}", "inventory"] },
  { method: "GET", shape: ["events"] },
  { method: "GET", shape: ["events", "{id}"] },
  { method: "GET", shape: ["events", "{id}", "causal"] },
  { method: "GET", shape: ["projects"] },
  { method: "GET", shape: ["worktrees"] },
  { method: "GET", shape: ["stream"] },
  { method: "POST", shape: ["agents", "{id}", "signal"] },
];

/**
 * Maps the proxy's catch-all segments to the daemon path they may become, or
 * `null` when the route is not admitted. The returned path is relative to the
 * daemon's `/api/v1/` prefix and keeps every parameter exactly as encoded.
 */
export function resolveDaemonPath(
  segments: string[],
  method = "GET",
): string | null {
  if (segments.length === 0) return null;
  for (const entry of ALLOWED_PATHS) {
    if (entry.method !== method) continue;
    const shape = entry.shape;
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
    const res = await daemonRequest(url, {
      method: "GET",
      headers: { Accept: accept },
      signal: combined,
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

/** A configuration failure must never leak the proof value into a response. */
export class SignalConfigurationError extends Error {}

/** One read per signal, from the same opened file whose permissions are checked. */
async function readProxySecret(): Promise<string> {
  const name = "AGENTVIEW_DAEMON_PROXY_SECRET_FILE";
  const path = process.env[name];
  if (!path) throw new SignalConfigurationError(`${name} is unset`);
  try {
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0)
        throw new Error(
          "must be a regular file private to its owner (mode 0600 or 0400)",
        );
      const secret = (await file.readFile("utf8")).trim();
      if (!secret || /[\r\n]/.test(secret))
        throw new Error("must contain one non-empty secret");
      return secret;
    } finally {
      await file.close();
    }
  } catch {
    throw new SignalConfigurationError(
      `${name} must name a readable regular file private to its owner, containing one non-empty secret`,
    );
  }
}

/** No caller headers are copied. Reads deliberately do not use this function. */
export async function postDaemonSignal(
  agentId: string,
  body: string,
  identity: { subject: string },
): Promise<DaemonFetchResult> {
  if (!identity.subject.trim())
    throw new SignalConfigurationError("a verified subject is required");
  const secret = await readProxySecret();
  const proof =
    process.env.AGENTVIEW_DAEMON_PROXY_PROOF_HEADER || "X-Dist-Agent-Proxy";
  const subject =
    process.env.AGENTVIEW_DAEMON_IDENTITY_HEADER || "X-Auth-Request-User";
  // Configuration cannot turn these dedicated assertions into cookies or replace
  // the forwarding tripwire/content negotiation headers.
  const reserved = [
    "cookie",
    "authorization",
    "origin",
    "accept",
    "content-type",
    "x-forwarded-for",
    "host",
  ];
  if (
    proof.toLowerCase() === subject.toLowerCase() ||
    [proof, subject].some(
      (h) =>
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h) ||
        reserved.includes(h.toLowerCase()),
    )
  )
    throw new SignalConfigurationError(
      "AGENTVIEW_DAEMON_PROXY_PROOF_HEADER and AGENTVIEW_DAEMON_IDENTITY_HEADER must name distinct assertion headers",
    );
  const { signal, cleanup } = withTimeout(undefined, DAEMON_CONNECT_TIMEOUT_MS);
  try {
    // Same transport as reads: the rebinding guard runs before any of the
    // assertions below are looked at, so a signal is refused by Host for the
    // same reason a read was. `reserved` above deliberately keeps "host" out of
    // the CONFIGURABLE assertion headers; the Host here is the transport's own,
    // set by daemonRequest and never taken from a caller.
    const res = await daemonRequest(
      `${agentviewDaemonUrl()}/api/v1/agents/${encodeURIComponent(agentId)}/signal`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          [proof]: secret,
          [subject]: identity.subject,
          // Next exposes no socket peer. Never use a request header as that
          // address; this literal is ADR 0026's explicit loopback fallback.
          "X-Forwarded-For": "127.0.0.1",
        },
        body,
        signal,
      },
    );
    return { ok: true, res };
  } catch {
    return {
      ok: false,
      kind: "unreachable",
      message:
        "signal request did not receive an answer; its outcome is unknown",
    };
  } finally {
    cleanup();
  }
}
