/**
 * Tests for GET /api/agentview/[...path]
 *
 * Mocks global fetch to stand in for the dist-agent daemon, and mocks
 * requireAuth to verify the auth gate without a live auth server. The
 * setup/teardown mirrors tests/api/watchtower/sessions-tools-route.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

// ─── hoist mock factories before any imports ────────────────────────────────
const { mockRequireAuth } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

const mockFetch = vi.fn();

const originalFetch = (
  globalThis as typeof globalThis & { fetch: typeof fetch }
).fetch;

const authed = () => mockRequireAuth.mockResolvedValue({ authenticated: true });

beforeEach(() => {
  mockFetch.mockReset();
  mockRequireAuth.mockReset();
  authed();
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
  vi.stubEnv("AGENTVIEW_DAEMON_URL", "http://daemon.test:7717");
  vi.stubEnv("HOST_WORKSPACE_PATH", "");
});

afterEach(() => {
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    originalFetch;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// Import after mock is registered
import { GET, POST } from "@/app/api/agentview/[...path]/route";

function ctx(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

/**
 * A request as the browser would send it: with the daax session cookie and an
 * Authorization header, neither of which may reach the daemon.
 */
function browserRequest(url: string): Request {
  return new Request(url, {
    headers: {
      Cookie: "daax_session=secret-session-value",
      Authorization: "Bearer daax-bearer",
      "X-Forwarded-User": "operator",
    },
  });
}

/** A trimmed copy of a live daemon's GET /api/v1/agents (protojson). */
const AGENTS_BODY = {
  agents: [
    {
      agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
      agent_type: "claude",
      node_id: "chamonix-d5d8554e",
      session_id: "4db77e81-4da9-4567-a755-ad316e8df7ba",
      repository_id: "repo-35bca69adfbc2a61",
      worktree_id: "wt-f8653bc6e727f11d",
      cwd: "/Users/operator/prj/jp/dist-agent",
      git_branch: "session-browser-ideas",
      state: "AGENT_STATE_ACTIVE",
      capabilities: {
        signals: {
          agent_events: { level: "CAPABILITY_LEVEL_AVAILABLE" },
          terminal: {
            level: "CAPABILITY_LEVEL_UNAVAILABLE",
            detail: "terminal attach not implemented before phase 3",
          },
        },
      },
      model: "claude-fable-5-1",
      last_activity: "2026-09-07T22:25:31.067Z",
      stats: {
        input_tokens: "32",
        output_tokens: "1332",
        cache_read_tokens: "140729",
        context_window: "200000",
        context_used_percent: 71.2,
        turn_count: 14,
      },
      process_alive: true,
      agent_pid: 40327,
      project_id: "proj-368667db2dfdaf8c",
      project_name: "jpoley/dist-agent",
      project_source: "PROJECT_SOURCE_REMOTE_URL",
    },
  ],
};

function upstreamJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/agentview/[...path]", () => {
  it("returns 401 with no-store when unauthenticated, and never contacts the daemon", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(
      browserRequest("http://localhost/api/agentview/agents"),
      ctx("agents"),
    );

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 for a route outside the allow-list without contacting the daemon", async () => {
    const res = await GET(
      browserRequest("http://localhost/api/agentview/prompts"),
      ctx("prompts"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "no such agentview route",
      path: "prompts",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses a payload route beneath an admitted prefix", async () => {
    const res = await GET(
      browserRequest("http://localhost/api/agentview/agents/x/conversation"),
      ctx("agents", "x", "conversation"),
    );
    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("passes a 200 JSON body through byte for byte", async () => {
    mockFetch.mockResolvedValueOnce(upstreamJson(AGENTS_BODY));

    const res = await GET(
      browserRequest("http://localhost/api/agentview/agents"),
      ctx("agents"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    // Byte-for-byte: the 64-bit token counts are still strings.
    expect(await res.text()).toBe(JSON.stringify(AGENTS_BODY));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://daemon.test:7717/api/v1/agents");
  });

  it("forwards the query string verbatim", async () => {
    mockFetch.mockResolvedValueOnce(upstreamJson({ events: [] }));

    const qs =
      "limit=50&descending=true&after_sequence=1477826&agent_id=chamonix%2Fclaude%2Fabc&event_type=EVENT_TYPE_TOOL_INVOKED&include_finished=true&include_all_hosts=true";
    await GET(
      browserRequest(`http://localhost/api/agentview/events?${qs}`),
      ctx("events"),
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://daemon.test:7717/api/v1/events?${qs}`);
  });

  it("resolves an agent id the way Next delivers it", async () => {
    mockFetch.mockResolvedValueOnce(upstreamJson(AGENTS_BODY.agents[0]));

    await GET(
      browserRequest(
        "http://localhost/api/agentview/agents/node%2Fclaude%2Fsession",
      ),
      ctx("agents", "node/claude/session"),
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://daemon.test:7717/api/v1/agents/node%2Fclaude%2Fsession",
    );
  });

  it("pins raw=false on a single-event read so the payload never crosses", async () => {
    mockFetch.mockResolvedValueOnce(upstreamJson({ event_id: "e1" }));

    await GET(
      browserRequest("http://localhost/api/agentview/events/e1?raw=true"),
      ctx("events", "e1"),
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://daemon.test:7717/api/v1/events/e1?raw=false");
  });

  it("sends the daemon only an Accept header — no Cookie, no Authorization", async () => {
    mockFetch.mockResolvedValueOnce(upstreamJson({ status: "ok" }));

    await GET(
      browserRequest("http://localhost/api/agentview/healthz"),
      ctx("healthz"),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sent = new Headers(init.headers);
    expect(sent.get("accept")).toBe("application/json");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("x-forwarded-user")).toBeNull();
    expect([...sent.keys()]).toEqual(["accept"]);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
  });

  it("maps an upstream 403 to 403 with the refusal shape", async () => {
    mockFetch.mockResolvedValueOnce(
      upstreamJson({ error: "no session: sign in at /auth/login" }, 403),
    );

    const res = await GET(
      browserRequest("http://localhost/api/agentview/agents"),
      ctx("agents"),
    );

    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "the daemon refused this request",
      upstream_status: 403,
      detail: '{"error":"no session: sign in at /auth/login"}',
    });
  });

  it("maps an upstream 401 to 401 and truncates the detail to 500 chars", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("x".repeat(2_000), { status: 401 }),
    );

    const res = await GET(
      browserRequest("http://localhost/api/agentview/node"),
      ctx("node"),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("the daemon refused this request");
    expect(body.upstream_status).toBe(401);
    expect(body.detail).toHaveLength(500);
  });

  it("passes through a non-refusal upstream error status and body", async () => {
    mockFetch.mockResolvedValueOnce(
      upstreamJson({ error: "limit must be a positive integer" }, 400),
    );

    const res = await GET(
      browserRequest("http://localhost/api/agentview/events?limit=x"),
      ctx("events"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "limit must be a positive integer",
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 502 with the unreachable shape when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:7717"));

    const res = await GET(
      browserRequest("http://localhost/api/agentview/agents"),
      ctx("agents"),
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "agentview daemon unreachable",
      daemon: "http://daemon.test:7717",
      reason: "ECONNREFUSED 127.0.0.1:7717",
    });
  });

  it("answers 502 naming the timeout when the daemon does not answer in time", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValueOnce(abortErr);

    const res = await GET(
      browserRequest("http://localhost/api/agentview/node"),
      ctx("node"),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("agentview daemon unreachable");
    expect(body.reason).toBe("no answer within 5000 ms");
  });

  it("forwards the stream as text/event-stream with the upstream body", async () => {
    const frames = [
      'event: replay_complete\ndata: {"last_sequence":1477826}\n\n',
      'id: 1477827\nevent: event\ndata: {"stream_id":"all","event":{"event_id":"e1","sequence":"1477827","event_type":"EVENT_TYPE_TOOL_INVOKED"}}\n\n',
    ];
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const f of frames) controller.enqueue(enc.encode(f));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const res = await GET(
      browserRequest(
        "http://localhost/api/agentview/stream?from_sequence=1477826",
      ),
      ctx("stream"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(await res.text()).toBe(frames.join(""));

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://daemon.test:7717/api/v1/stream?from_sequence=1477826",
    );
    expect(new Headers(init.headers).get("accept")).toBe("text/event-stream");
  });

  it("aborts the upstream fetch when the incoming request is aborted", async () => {
    const incoming = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      upstreamSignal = init.signal ?? undefined;
      return Promise.resolve(upstreamJson({ status: "ok" }));
    });

    await GET(
      new Request("http://localhost/api/agentview/healthz", {
        signal: incoming.signal,
      }),
      ctx("healthz"),
    );

    expect(upstreamSignal?.aborted).toBe(false);
    incoming.abort();
    expect(upstreamSignal?.aborted).toBe(true);
  });
});

const SUBJECT = "a8e78e55-bcde-4789-9210-981476abc123";
const SIGNAL_BODY = {
  agent_id: "node/claude/session",
  signal: "interrupt",
  outcome: "sent",
  recorded: true,
  note: "the effect is learned on the next process poll",
  event_id: "agent-signal-123",
};
const REMOTE_BODY = {
  agent_id: "galway/claude/session",
  signal: "interrupt",
  outcome: "refused",
  recorded: true,
  note: "refusal recorded",
  event_id: "agent-signal-refused-456",
  error:
    'no agent "galway/claude/session" is in this node\'s registry; its prefix names node galway, and control is not federated: node galway has its own control surface at https://agent.galway.example (ADR 0026 §3); this daemon can only signal processes it can see',
};

function signalRequest(
  id = "node/claude/session",
  body = '{ "signal": "interrupt" }',
) {
  return new Request(
    `http://localhost/api/agentview/agents/${encodeURIComponent(id)}/signal`,
    {
      method: "POST",
      body,
      headers: {
        "X-Forwarded-User": SUBJECT,
        "X-Forwarded-Username": "display-name",
        "X-Forwarded-Email": "display@example.test",
        "X-Daax-Proxy-Secret": "test-daax-proof",
        "X-Forwarded-For": "198.51.100.7",
        Cookie: "daax_session=must-not-forward",
        Authorization: "Bearer must-not-forward",
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
    },
  );
}

describe("POST /api/agentview/[...path]", () => {
  let dir: string;
  let secretPath: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agentview-proof-"));
    secretPath = join(dir, "proxy.secret");
    await writeFile(secretPath, "test-daemon-proof\n", { mode: 0o600 });
    vi.stubEnv("AGENTVIEW_DAEMON_PROXY_SECRET_FILE", secretPath);
    vi.stubEnv("AGENTVIEW_DAEMON_PROXY_PROOF_HEADER", "");
    vi.stubEnv("AGENTVIEW_DAEMON_IDENTITY_HEADER", "");
    vi.stubEnv("DAAX_PROXY_SECRET", "test-daax-proof");
    vi.stubEnv("DAAX_TRUST_LOCAL_OPERATOR", "1");
    vi.stubEnv("DAAX_REQUIRE_AUTH", "");
    mockFetch.mockImplementation(() =>
      Promise.resolve(upstreamJson(SIGNAL_BODY)),
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses to sign for a forwarded subject that carried no proxy proof", async () => {
    vi.stubEnv("DAAX_PROXY_SECRET", undefined);
    vi.stubEnv("DAAX_PROXY_SECRET_PREVIOUS", undefined);
    vi.stubEnv("DAAX_REQUIRE_AUTH", undefined);
    vi.stubEnv("HOST", undefined);
    const req = signalRequest();
    req.headers.delete("X-Daax-Proxy-Secret");
    const res = await POST(req, ctx("agents", "node/claude/session", "signal"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "cannot break in",
      reason:
        "DAAX_PROXY_SECRET proof is required; daax will not vouch for a name it did not verify",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([undefined, "off"])(
    "refuses a cross-site signal from its own handler, not only from the middleware (%s)",
    async (guard) => {
      vi.stubEnv("DAAX_API_GUARD", guard);
      for (const [header, value, status] of [
        ["Sec-Fetch-Site", "cross-site", 403],
        ["Sec-Fetch-Site", "same-site", 403],
        ["Content-Type", "text/plain", 415],
        ["Content-Type", "application/jsonp", 415],
        ["Content-Type", "", 415],
      ] as const) {
        const req = signalRequest();
        req.headers.set(header, value);
        const res = await POST(
          req,
          ctx("agents", "node/claude/session", "signal"),
        );
        expect(res.status, `${header}: ${value}`).toBe(status);
      }
      expect(mockRequireAuth).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each(["same-origin", "none", undefined])(
    "accepts a JSON signal with charset and permitted fetch metadata (%s)",
    async (site) => {
      const req = signalRequest();
      req.headers.set("Content-Type", "Application/JSON; charset=utf-8");
      if (site) req.headers.set("Sec-Fetch-Site", site);
      const res = await POST(
        req,
        ctx("agents", "node/claude/session", "signal"),
      );
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["Cookie", "X-Subject"],
    ["X-Proof", "Cookie"],
    ["Authorization", "X-Subject"],
    ["Origin", "X-Subject"],
    ["Host", "X-Subject"],
    ["Accept", "X-Subject"],
    ["Content-Type", "X-Subject"],
    ["X-Forwarded-For", "X-Subject"],
    ["X-Same", "x-same"],
    ["Invalid Header", "X-Subject"],
  ])(
    "refuses header names that would become a cookie or collide (%s, %s)",
    async (proof, subject) => {
      vi.stubEnv("AGENTVIEW_DAEMON_PROXY_PROOF_HEADER", proof);
      vi.stubEnv("AGENTVIEW_DAEMON_IDENTITY_HEADER", subject);
      const res = await POST(
        signalRequest(),
        ctx("agents", "node/claude/session", "signal"),
      );
      expect(res.status).toBe(503);
      expect(await res.text()).toContain(
        "must name distinct assertion headers",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("requires authentication before examining the path or contacting the daemon", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST(signalRequest(), ctx("settings"));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards the operator's subject and the proof secret on a signal, and nothing else", async () => {
    const res = await POST(
      signalRequest(),
      ctx("agents", "node/claude/session", "signal"),
    );
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "http://daemon.test:7717/api/v1/agents/node%2Fclaude%2Fsession/signal",
    );
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      "x-dist-agent-proxy": "test-daemon-proof",
      "x-auth-request-user": "a8e78e55-bcde-4789-9210-981476abc123",
      "x-forwarded-for": "127.0.0.1",
    });
    expect(init.body).toBe('{ "signal": "interrupt" }');
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
  });

  it("refuses to break in for a local operator with no subject, without contacting the daemon", async () => {
    const res = await POST(
      new Request("http://localhost/api/agentview/agents/a/signal", {
        method: "POST",
        body: '{"signal":"interrupt"}',
        headers: { "Content-Type": "application/json" },
      }),
      ctx("agents", "a", "signal"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "cannot break in",
      reason:
        "daax trusted the local operator without a name, and the daemon records a signal against a person",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("answers 503 naming AGENTVIEW_DAEMON_PROXY_SECRET_FILE when it is unset", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_PROXY_SECRET_FILE", "");
    const res = await POST(
      signalRequest(),
      ctx("agents", "node/claude/session", "signal"),
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("AGENTVIEW_DAEMON_PROXY_SECRET_FILE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a secret file readable by others", async () => {
    await chmod(secretPath, 0o644);
    const res = await POST(
      signalRequest(),
      ctx("agents", "node/claude/session", "signal"),
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("AGENTVIEW_DAEMON_PROXY_SECRET_FILE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses configured header names and reads a rotated secret on the next request", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_PROXY_PROOF_HEADER", "X-Test-Proof");
    vi.stubEnv("AGENTVIEW_DAEMON_IDENTITY_HEADER", "X-Test-Subject");
    await POST(signalRequest(), ctx("agents", "node/claude/session", "signal"));
    await writeFile(secretPath, "rotated-test-proof\n");
    await POST(signalRequest(), ctx("agents", "node/claude/session", "signal"));
    expect(
      new Headers(mockFetch.mock.calls[0][1].headers).get("X-Test-Proof"),
    ).toBe("test-daemon-proof");
    expect(
      new Headers(mockFetch.mock.calls[1][1].headers).get("X-Test-Proof"),
    ).toBe("rotated-test-proof");
    expect(
      new Headers(mockFetch.mock.calls[1][1].headers).get("X-Test-Subject"),
    ).toBe("a8e78e55-bcde-4789-9210-981476abc123");
  });

  it.each([
    [200, SIGNAL_BODY],
    [421, REMOTE_BODY],
  ])(
    "passes the daemon's outcome, recorded and event_id through unchanged (%s)",
    async (status, body) => {
      const wire = JSON.stringify(body, null, 2);
      mockFetch.mockResolvedValueOnce(
        new Response(wire, {
          status: status as number,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const res = await POST(
        signalRequest(),
        ctx("agents", "node/claude/session", "signal"),
      );
      expect(res.status).toBe(status);
      expect(await res.text()).toBe(wire);
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );

  it.each([
    ["settings"],
    ["auth", "session"],
    ["agents", "a", "prompt"],
    ["worktrees", "a", "reconcile"],
  ])("refuses undeclared POST %j", async (...parts) => {
    const res = await POST(signalRequest(), ctx(...parts));
    expect(res.status).toBe(405);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports terminal locality from runtime HOST_WORKSPACE_PATH without changing the node body", async () => {
    for (const [workspace, expected] of [
      ["", "1"],
      ["/host/prj", "0"],
    ]) {
      vi.stubEnv("HOST_WORKSPACE_PATH", workspace);
      mockFetch.mockResolvedValueOnce(
        upstreamJson({ node: { node_id: "node" } }),
      );
      const res = await GET(
        browserRequest("http://localhost/api/agentview/node"),
        ctx("node"),
      );
      expect(res.headers.get("X-Agentview-Terminal-Local")).toBe(expected);
      expect(await res.json()).toEqual({ node: { node_id: "node" } });
      expect([
        ...new Headers(mockFetch.mock.calls.at(-1)![1].headers).keys(),
      ]).toEqual(["accept"]);
    }
  });
});
