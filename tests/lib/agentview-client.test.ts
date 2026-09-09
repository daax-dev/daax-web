/**
 * Browser-side Agent View client (lib/agentview/client.ts): status → result
 * mapping, request shaping, the SSE subscription, and the pure helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAgents,
  fetchEvents,
  fetchHealth,
  fetchNode,
  fetchProjects,
  fetchWorktrees,
  formatAge,
  openStream,
  parseInt64,
  stripEnum,
} from "@/lib/agentview/client";
import type { AgentEvent } from "@/lib/agentview/types";

const mockFetch = vi.fn();

function reply(status: number, body: unknown, json = true): Response {
  return new Response(json ? JSON.stringify(body) : String(body), {
    status,
    headers: { "Content-Type": json ? "application/json" : "text/html" },
  });
}

function calledUrl(): string {
  return mockFetch.mock.calls[0][0] as string;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readers map the proxy's answers to DaemonResult", () => {
  it("200 JSON → ok with the parsed body", async () => {
    mockFetch.mockResolvedValueOnce(
      reply(200, { status: "ok", version: "dev" }),
    );
    const r = await fetchHealth();
    expect(r).toEqual({ ok: true, data: { status: "ok", version: "dev" } });
    expect(calledUrl()).toBe("/api/agentview/healthz");
  });

  it("401 → refused", async () => {
    mockFetch.mockResolvedValueOnce(
      reply(401, {
        error: "the daemon refused this request",
        upstream_status: 401,
        detail: "no session",
      }),
    );
    const r = await fetchNode();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("refused");
    expect(r.status).toBe(401);
    expect(r.message).toBe(
      "the daemon refused this request (HTTP 401): no session",
    );
  });

  it("403 → refused", async () => {
    mockFetch.mockResolvedValueOnce(reply(403, { error: "forbidden" }));
    const r = await fetchAgents();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("refused");
    expect(r.status).toBe(403);
  });

  it("502 with the unreachable shape → unreachable, naming the daemon", async () => {
    mockFetch.mockResolvedValueOnce(
      reply(502, {
        error: "agentview daemon unreachable",
        daemon: "http://127.0.0.1:7717",
        reason: "ECONNREFUSED",
      }),
    );
    const r = await fetchProjects();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("unreachable");
    expect(r.status).toBe(502);
    expect(r.message).toBe(
      "http://127.0.0.1:7717 is unreachable: ECONNREFUSED",
    );
  });

  it("502 without the unreachable shape → error, not unreachable", async () => {
    mockFetch.mockResolvedValueOnce(
      reply(502, "<html>bad gateway</html>", false),
    );
    const r = await fetchWorktrees();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.status).toBe(502);
  });

  it("500 → error with the server's message", async () => {
    mockFetch.mockResolvedValueOnce(reply(500, { error: "store closed" }));
    const r = await fetchEvents();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.status).toBe(500);
    expect(r.message).toBe("HTTP 500: store closed");
  });

  it("404 → error (the proxy names an unknown route)", async () => {
    mockFetch.mockResolvedValueOnce(
      reply(404, { error: "no such agentview route", path: "prompts" }),
    );
    const r = await fetchNode();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.message).toBe("HTTP 404: no such agentview route");
  });

  it("200 non-JSON → error, never ok with garbage", async () => {
    mockFetch.mockResolvedValueOnce(reply(200, "<html>login</html>", false));
    const r = await fetchHealth();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    expect(r.message).toBe("HTTP 200 but the body was not JSON");
  });

  it("a network failure reaching daax → unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await fetchHealth();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("unreachable");
    expect(r.message).toBe("could not reach the daax server: Failed to fetch");
  });

  it("an empty successful list is ok, not a failure kind", async () => {
    mockFetch.mockResolvedValueOnce(reply(200, { agents: [] }));
    const r = await fetchAgents();
    expect(r).toEqual({ ok: true, data: { agents: [] } });
  });
});

describe("readers shape their requests", () => {
  beforeEach(() => mockFetch.mockResolvedValue(reply(200, {})));

  it("fetchAgents sends no query by default and the two flags when asked", async () => {
    await fetchAgents();
    expect(calledUrl()).toBe("/api/agentview/agents");
    mockFetch.mockClear();
    await fetchAgents({ includeFinished: true, includeAllHosts: true });
    expect(calledUrl()).toBe(
      "/api/agentview/agents?include_finished=true&include_all_hosts=true",
    );
  });

  it("fetchEvents builds the query string exactly", async () => {
    await fetchEvents({
      agentId: "chamonix/claude/abc",
      sessionId: "s-1",
      limit: 50,
      descending: true,
      afterSequence: 1477826,
    });
    expect(calledUrl()).toBe(
      "/api/agentview/events?agent_id=chamonix%2Fclaude%2Fabc&session_id=s-1&limit=50&descending=true&after_sequence=1477826",
    );
  });

  it("fetchEvents omits descending=false and unset fields", async () => {
    await fetchEvents({ limit: 0, descending: false });
    expect(calledUrl()).toBe("/api/agentview/events?limit=0");
  });

  it("every reader asks for JSON and never caches", async () => {
    await fetchProjects();
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect(calledUrl()).toBe("/api/agentview/projects");
  });
});

describe("stripEnum", () => {
  it.each([
    ["AGENT_STATE_ACTIVE", "ACTIVE"],
    ["CAPABILITY_LEVEL_LIMITED", "LIMITED"],
    ["EVENT_TYPE_TOOL_INVOKED", "TOOL_INVOKED"],
    ["NODE_CLASS_FULL_HOST", "FULL_HOST"],
    ["PROJECT_SOURCE_REMOTE_URL", "REMOTE_URL"],
    ["AVAILABLE", "AVAILABLE"],
    ["", ""],
  ])("%s → %s", (input, want) => {
    expect(stripEnum(input)).toBe(want);
  });

  it("returns an empty string for undefined", () => {
    expect(stripEnum(undefined)).toBe("");
  });
});

describe("parseInt64", () => {
  it.each([
    ["1477826", 1477826],
    ["0", 0],
    ["-3", -3],
    ["", undefined],
    ["abc", undefined],
    [undefined, undefined],
  ])("%j → %j", (input, want) => {
    expect(parseInt64(input as string | undefined)).toBe(want);
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-09-07T22:30:00Z");
  const at = (secondsAgo: number) =>
    new Date(now - secondsAgo * 1000).toISOString();

  it.each([
    [0, "0s ago"],
    [12, "12s ago"],
    [59, "59s ago"],
    [60, "1m ago"],
    [4 * 60 + 30, "4m ago"],
    [2 * 3600, "2h ago"],
    [23 * 3600 + 59 * 60, "23h ago"],
    [3 * 86400, "3d ago"],
  ])("%d seconds ago → %s", (secondsAgo, want) => {
    expect(formatAge(at(secondsAgo), now)).toBe(want);
  });

  it("says never for a missing or unparseable timestamp", () => {
    expect(formatAge(undefined, now)).toBe("never");
    expect(formatAge("", now)).toBe("never");
    expect(formatAge("not a date", now)).toBe("never");
  });

  it("names a clock ahead of now instead of inventing a negative age", () => {
    expect(formatAge(at(-6), now)).toBe("in the future");
    // Within the 5 s tolerance it is a rounding, not a disagreement.
    expect(formatAge(at(-3), now)).toBe("0s ago");
  });

  it("is a function of the moment it is called: one timestamp, two nows, two answers", () => {
    const stamp = at(30);
    const first = formatAge(stamp, now);
    const later = formatAge(stamp, now + 10 * 60 * 1000);
    expect(first).toBe("30s ago");
    expect(later).toBe("10m ago");
    expect(first).not.toBe(later);
  });
});

describe("openStream", () => {
  type Listener = (e: MessageEvent) => void;

  class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    static instances: FakeEventSource[] = [];
    readyState = FakeEventSource.CONNECTING;
    listeners = new Map<string, Listener[]>();
    close = vi.fn(() => {
      this.readyState = FakeEventSource.CLOSED;
    });
    constructor(public url: string) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(name: string, fn: Listener) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
    }
    dispatch(name: string, data?: string) {
      for (const fn of this.listeners.get(name) ?? [])
        fn({ data } as MessageEvent);
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("subscribes to the proxy stream and parses both event names", () => {
    const onEvent = vi.fn();
    const onReplayComplete = vi.fn();
    const onError = vi.fn();

    const handle = openStream({
      afterSequence: 1477826,
      onEvent,
      onReplayComplete,
      onError,
    });

    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/agentview/stream?from_sequence=1477826");

    es.dispatch("replay_complete", '{"last_sequence":1477826}');
    expect(onReplayComplete).toHaveBeenCalledWith(1477826);

    const event: AgentEvent = {
      event_id: "e1",
      node_id: "n",
      timestamp: "2026-09-07T22:30:00Z",
      sequence: "1477827",
      event_type: "EVENT_TYPE_TOOL_INVOKED",
    };
    es.dispatch("event", JSON.stringify({ stream_id: "all", event }));
    expect(onEvent).toHaveBeenCalledWith(event, "all");
    expect(onError).not.toHaveBeenCalled();

    handle.close();
    expect(es.close).toHaveBeenCalledTimes(1);
  });

  it("reports a loss once and does not reconnect by itself", () => {
    const onError = vi.fn();
    openStream({
      onEvent: vi.fn(),
      onReplayComplete: vi.fn(),
      onError,
    });
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/agentview/stream");

    es.dispatch("error");
    es.dispatch("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      "the stream was interrupted; reconnecting",
    );
    // Reporting is not retrying: one EventSource, ever, until close().
    expect(FakeEventSource.instances).toHaveLength(1);

    es.dispatch("open");
    es.readyState = FakeEventSource.CLOSED;
    es.dispatch("error");
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith("the stream was closed");
  });

  it("spells the stream cursor from_sequence, unlike the events list's after_sequence", async () => {
    // agentd reads the two cursors under different names (internal/api/stream.go
    // vs internal/api/server.go). Both literals are asserted so that unifying
    // them in the client is exactly what fails here.
    openStream({
      afterSequence: 42,
      onEvent: vi.fn(),
      onReplayComplete: vi.fn(),
      onError: vi.fn(),
    });
    expect(FakeEventSource.instances[0].url).toBe(
      "/api/agentview/stream?from_sequence=42",
    );

    mockFetch.mockResolvedValueOnce(reply(200, { events: [] }));
    await fetchEvents({ afterSequence: 42 });
    expect(calledUrl()).toBe("/api/agentview/events?after_sequence=42");
  });

  it("ignores a frame whose data is not an envelope", () => {
    const onEvent = vi.fn();
    openStream({ onEvent, onReplayComplete: vi.fn(), onError: vi.fn() });
    const es = FakeEventSource.instances[0];
    es.dispatch("event", "not json");
    es.dispatch("event", '{"stream_id":"all"}');
    expect(onEvent).not.toHaveBeenCalled();
  });
});
