/**
 * Browser-side readers for the Agent View tab. Everything here goes through
 * the daax proxy (`GET /api/agentview/*`, app/api/agentview/[...path]/route.ts)
 * and never to the daemon directly, which is why this file imports nothing from
 * the server side and is safe to pull into a `"use client"` component.
 *
 * Every reader resolves to a `DaemonResult<T>` (lib/agentview/types.ts) and
 * never throws. The three failure kinds are the proxy's contract, mapped here
 * from status codes so a component only ever switches on `kind`:
 *
 *   401 / 403               → `refused`      the daemon exists and would not say
 *   502 (proxy could not connect) → `unreachable`
 *   anything else non-OK, or a body that is not JSON → `error`
 *
 * A successful `ok` with an empty list is *not* a failure and is never
 * spelled with one of those kinds — "nothing happened" and "we cannot see"
 * must stay distinguishable (dist-agent ADR 0008 §5).
 */

import type {
  AgentEvent,
  AgentInstance,
  AgentsResponse,
  DaemonResult,
  EventsResponse,
  HealthResponse,
  NodeResponse,
  ProjectsResponse,
  WorktreesResponse,
} from "./types";

/** The proxy's mount point. The stream lives at `${PROXY_BASE}/stream`. */
export const PROXY_BASE = "/api/agentview";

// ─── Readers ─────────────────────────────────────────────────────────────────

export function fetchNode(): Promise<DaemonResult<NodeResponse>> {
  return readJson<NodeResponse>("node");
}

export function fetchHealth(): Promise<DaemonResult<HealthResponse>> {
  return readJson<HealthResponse>("healthz");
}

export interface FetchAgentsOptions {
  includeFinished?: boolean;
  includeAllHosts?: boolean;
}

export function fetchAgents(
  opts: FetchAgentsOptions = {},
): Promise<DaemonResult<AgentsResponse>> {
  const q = new URLSearchParams();
  if (opts.includeFinished) q.set("include_finished", "true");
  if (opts.includeAllHosts) q.set("include_all_hosts", "true");
  return readJson<AgentsResponse>("agents", q);
}

/** `agentId` is `node/type/session`; it is sent as one encoded segment. */
export function fetchAgent(
  agentId: string,
): Promise<DaemonResult<AgentInstance>> {
  return readJson<AgentInstance>(`agents/${encodeURIComponent(agentId)}`);
}

export interface FetchEventsOptions {
  agentId?: string;
  sessionId?: string;
  limit?: number;
  descending?: boolean;
  afterSequence?: number;
}

export function fetchEvents(
  opts: FetchEventsOptions = {},
): Promise<DaemonResult<EventsResponse>> {
  const q = new URLSearchParams();
  if (opts.agentId) q.set("agent_id", opts.agentId);
  if (opts.sessionId) q.set("session_id", opts.sessionId);
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  if (opts.descending) q.set("descending", "true");
  if (opts.afterSequence !== undefined)
    q.set("after_sequence", String(opts.afterSequence));
  return readJson<EventsResponse>("events", q);
}

export function fetchProjects(): Promise<DaemonResult<ProjectsResponse>> {
  return readJson<ProjectsResponse>("projects");
}

export function fetchWorktrees(): Promise<DaemonResult<WorktreesResponse>> {
  return readJson<WorktreesResponse>("worktrees");
}

// ─── The one fetch ───────────────────────────────────────────────────────────

/** What the proxy writes when it could not reach the daemon. */
const UNREACHABLE_ERROR = "agentview daemon unreachable";

async function readJson<T>(
  path: string,
  query?: URLSearchParams,
): Promise<DaemonResult<T>> {
  const qs = query?.toString();
  const url = `${PROXY_BASE}/${path}${qs ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return {
      ok: false,
      kind: "unreachable",
      message: `could not reach the daax server: ${describe(err)}`,
    };
  }

  const text = await res.text().catch(() => "");
  let body: unknown = undefined;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  const errorField =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : undefined;

  if (res.status === 401 || res.status === 403) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : "";
    return {
      ok: false,
      kind: "refused",
      status: res.status,
      message:
        `the daemon refused this request (HTTP ${res.status})` +
        (detail ? `: ${detail}` : ""),
    };
  }

  if (res.status === 502 && errorField === UNREACHABLE_ERROR) {
    const daemon =
      body && typeof body === "object" && "daemon" in body
        ? String((body as { daemon: unknown }).daemon)
        : "the daemon";
    const reason =
      body && typeof body === "object" && "reason" in body
        ? String((body as { reason: unknown }).reason)
        : "";
    return {
      ok: false,
      kind: "unreachable",
      status: res.status,
      message: `${daemon} is unreachable${reason ? `: ${reason}` : ""}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "error",
      status: res.status,
      message: errorField
        ? `HTTP ${res.status}: ${errorField}`
        : `HTTP ${res.status} from ${url}`,
    };
  }

  if (body === undefined) {
    return {
      ok: false,
      kind: "error",
      status: res.status,
      message: `HTTP ${res.status} but the body was not JSON`,
    };
  }

  return { ok: true, data: body as T };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── The stream ──────────────────────────────────────────────────────────────

export interface OpenStreamOptions {
  /**
   * Resume after this sequence. The stream spells its cursor `from_sequence`
   * (internal/api/stream.go) where the events list spells it `after_sequence`
   * (internal/api/server.go); the two are not interchangeable.
   */
  afterSequence?: number;
  onEvent: (event: AgentEvent, streamId: string) => void;
  onReplayComplete: (lastSequence: number) => void;
  /**
   * Called once per connection loss. `EventSource` reconnects by itself, so
   * this reports and does not retry; a caller wanting to stop calls `close()`.
   */
  onError: (message: string) => void;
}

export interface StreamHandle {
  close(): void;
}

/**
 * Subscribes to `GET /api/agentview/stream`. The daemon writes
 * `event: replay_complete` with `{ last_sequence }` once history is replayed,
 * then `event: event` with `{ stream_id, event }` per row; the browser's
 * `EventSource` also carries each frame's `id:` as `lastEventId`.
 */
export function openStream(opts: OpenStreamOptions): StreamHandle {
  const q = new URLSearchParams();
  if (opts.afterSequence !== undefined)
    q.set("from_sequence", String(opts.afterSequence));
  const qs = q.toString();
  const url = `${PROXY_BASE}/stream${qs ? `?${qs}` : ""}`;

  const source = new EventSource(url);
  let reported = false;

  source.addEventListener("replay_complete", (e) => {
    const data = parseData((e as MessageEvent).data);
    const last = parseInt64(
      data && typeof data === "object" && "last_sequence" in data
        ? String((data as { last_sequence: unknown }).last_sequence)
        : undefined,
    );
    opts.onReplayComplete(last ?? 0);
  });

  source.addEventListener("event", (e) => {
    const data = parseData((e as MessageEvent).data);
    if (!data || typeof data !== "object" || !("event" in data)) return;
    const env = data as { stream_id?: unknown; event: AgentEvent };
    opts.onEvent(
      env.event,
      typeof env.stream_id === "string" ? env.stream_id : "",
    );
  });

  source.addEventListener("open", () => {
    // A reconnect that succeeds resets the one-shot so the next loss is reported.
    reported = false;
  });

  source.addEventListener("error", () => {
    if (reported) return;
    reported = true;
    const state =
      source.readyState === EventSource.CLOSED
        ? "the stream was closed"
        : "the stream was interrupted; reconnecting";
    opts.onError(state);
  });

  return { close: () => source.close() };
}

function parseData(raw: unknown): unknown {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * `AGENT_STATE_ACTIVE` → `ACTIVE`, `CAPABILITY_LEVEL_LIMITED` → `LIMITED`,
 * `EVENT_TYPE_TOOL_INVOKED` → `TOOL_INVOKED`. Strips the proto enum's type
 * prefix; anything without a known prefix is returned unchanged.
 */
export function stripEnum(value: string | undefined | null): string {
  if (!value) return "";
  for (const prefix of ENUM_PREFIXES) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return value;
}

const ENUM_PREFIXES = [
  "AGENT_STATE_",
  "CAPABILITY_LEVEL_",
  "EVENT_TYPE_",
  "NODE_CLASS_",
  "PROJECT_SOURCE_",
  "BUILD_INFO_STATE_",
];

/** protojson 64-bit integers arrive as strings; unparseable → undefined. */
export function parseInt64(value?: string | number | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Renders a timestamp as an age relative to `now`. Call it at render time —
 * an age computed once and cached reproduces exactly the staleness it exists
 * to expose. `never` for a missing value; `in the future` when the timestamp
 * is more than 5 s ahead (a clock disagreement, not an age).
 */
export function formatAge(
  iso: string | undefined | null,
  now: number = Date.now(),
): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "never";
  const delta = now - t;
  if (delta < -5_000) return "in the future";
  const s = Math.max(0, Math.floor(delta / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
