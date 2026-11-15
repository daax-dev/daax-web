import { describe, it, expect, vi } from "vitest";
import {
  Client,
  DEFAULT_URL,
  UsageError,
  followRun,
  formatWorkers,
  parseArgs,
  parseAuthHeader,
  resolveBaseUrl,
  runCli,
  type Deps,
} from "@/scripts/workers-cli";
import type { WorkerRun, WorkerRunEvent, WorkerSummary } from "@/types/workers";

const RUN_ID = "11111111-2222-3333-4444-555555555555";

function run(
  status: WorkerRun["status"],
  extra: Partial<WorkerRun> = {},
): WorkerRun {
  return {
    id: RUN_ID,
    workerId: "w1",
    trigger: "cli",
    input: "",
    status,
    engine: "claude-cli",
    queuedAt: "2026-09-26T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
    usage: {},
    requestedBy: null,
    cancelRequested: false,
    ...extra,
  };
}

function event(seq: number, text: string): WorkerRunEvent {
  return {
    id: seq,
    runId: RUN_ID,
    seq,
    at: "2026-09-26T10:00:01.000Z",
    type: "message",
    text,
  };
}

function worker(extra: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "w1",
    slug: "tpm",
    name: "TPM",
    role: "tpm",
    description: "",
    instructions: "",
    engine: "claude-cli",
    model: null,
    runMode: "schedule",
    cron: "0 8 * * *",
    cooldownSeconds: 0,
    maxRunsPerDay: 10,
    timeoutSeconds: 600,
    autonomy: "observe",
    executor: "auto",
    workingDir: null,
    mcpServers: [],
    enabled: true,
    pausedReason: null,
    createdBy: null,
    createdAt: "2026-09-26T09:00:00.000Z",
    updatedAt: "2026-09-26T09:00:00.000Z",
    state: "idle",
    lastRun: null,
    nextRunAt: null,
    activeGoals: 0,
    ...extra,
  };
}

type Handler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body: unknown };

function harness(
  handler: Handler,
  env: Record<string, string | undefined> = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const deps: Deps = {
    env,
    fetch: fetchFn,
    sleep: vi.fn(async () => {}),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  };
  return { deps, out, err, calls, fetchFn };
}

describe("parseArgs", () => {
  it("splits command, positionals and flags", () => {
    expect(parseArgs(["runs", "tpm", "--limit", "5", "--json"])).toEqual({
      command: "runs",
      args: ["tpm"],
      flags: { limit: "5", json: true },
    });
    expect(
      parseArgs(["goals", "tpm", "add", "Ship", "--project=/p"]).flags,
    ).toEqual({
      project: "/p",
    });
  });

  it("defaults to help", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["ls", "--help"]).command).toBe("help");
  });

  it("rejects unknown options and missing values", () => {
    expect(() => parseArgs(["ls", "--bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["runs", "tpm", "--limit"])).toThrow(UsageError);
    expect(() => parseArgs(["ls", "--json=1"])).toThrow(UsageError);
  });
});

describe("usage errors exit 2", () => {
  it.each([
    [["bogus"]],
    [["show"]],
    [["ask", "tpm"]],
    [["ask", "tpm", "   "]],
    [["create"]],
    [["runs", "tpm", "--limit", "0"]],
    [["goals", "tpm", "frob"]],
    [["ls", "extra"]],
  ])("%j", async (argv) => {
    const h = harness(() => ({ body: {} }));
    expect(await runCli(argv, h.deps)).toBe(2);
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.err.join("\n")).not.toBe("");
  });

  it("help exits 0 and documents DAAX_AUTH_HEADER", async () => {
    const h = harness(() => ({ body: {} }));
    expect(await runCli(["help"], h.deps)).toBe(0);
    expect(h.out[0]).toContain("DAAX_AUTH_HEADER");
  });
});

describe("environment", () => {
  it("resolves DAAX_URL with default and trailing slash tolerance", () => {
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_URL);
    expect(resolveBaseUrl("")).toBe(DEFAULT_URL);
    expect(resolveBaseUrl("https://daax.example.com/")).toBe(
      "https://daax.example.com",
    );
  });

  it("rejects non-http(s) or malformed DAAX_URL with exit 2", async () => {
    expect(() => resolveBaseUrl("ftp://x")).toThrow(UsageError);
    expect(() => resolveBaseUrl("not a url")).toThrow(UsageError);
    const h = harness(() => ({ body: {} }), { DAAX_URL: "file:///etc" });
    expect(await runCli(["ls"], h.deps)).toBe(2);
  });

  it("parses DAAX_AUTH_HEADER without leaking the value in errors", () => {
    expect(parseAuthHeader(undefined)).toBeNull();
    expect(parseAuthHeader("X-Token: abc:def")).toEqual(["X-Token", "abc:def"]);
    for (const bad of ["secretvalue", "Bad Name: secretvalue", "X-Token:  "]) {
      try {
        parseAuthHeader(bad);
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(UsageError);
        expect((e as Error).message).not.toContain("secretvalue");
      }
    }
  });

  it("sends the extra header and uses the base URL", async () => {
    const h = harness(() => ({ body: { workers: [] } }), {
      DAAX_URL: "http://h:1/",
      DAAX_AUTH_HEADER: "X-Token: s3cret",
    });
    expect(await runCli(["ls"], h.deps)).toBe(0);
    expect(h.calls[0].url).toBe("http://h:1/api/workers");
    expect(
      (h.calls[0].init?.headers as Record<string, string>)["X-Token"],
    ).toBe("s3cret");
    expect([...h.out, ...h.err].join("\n")).not.toContain("s3cret");
  });
});

describe("ls", () => {
  it("prints an aligned table", () => {
    const text = formatWorkers([
      worker(),
      worker({
        name: "Longer Name",
        slug: "long",
        state: "paused",
        runMode: "adhoc",
      }),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(
      /^NAME\/SLUG\s+STATE\s+MODE\s+ENGINE\s+NEXT RUN\s+LAST RUN$/,
    );
    const col = lines[0].indexOf("STATE");
    expect(lines[1].indexOf("idle")).toBe(col);
    expect(lines[2].indexOf("paused")).toBe(col);
    expect(lines[2]).toContain("Longer Name (long)");
  });

  it("--json prints raw JSON", async () => {
    const body = {
      workers: [worker()],
      templates: [],
      engines: [],
      schedulerLeader: true,
    };
    const h = harness(() => ({ body }));
    expect(await runCli(["ls", "--json"], h.deps)).toBe(0);
    expect(JSON.parse(h.out[0])).toEqual(body);
  });
});

describe("run / ask", () => {
  it("ask posts input with trigger cli, waits, prints the summary", async () => {
    let polls = 0;
    const h = harness((url, init) => {
      if (init?.method === "POST")
        return { status: 202, body: { run: run("queued") } };
      polls++;
      return polls < 3
        ? { body: { run: run("running"), events: [] } }
        : {
            body: {
              run: run("succeeded", { summary: "All green." }),
              events: [],
            },
          };
    });
    expect(await runCli(["ask", "tpm", "What is blocked?"], h.deps)).toBe(0);
    expect(h.calls[0].url).toBe(`${DEFAULT_URL}/api/workers/tpm/runs`);
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      trigger: "cli",
      input: "What is blocked?",
    });
    expect(polls).toBe(3);
    expect(h.deps.sleep).toHaveBeenCalledWith(2000);
    expect(h.out).toEqual(["All green."]);
  });

  it("run without --wait only queues", async () => {
    const h = harness(() => ({ status: 202, body: { run: run("queued") } }));
    expect(await runCli(["run", "tpm"], h.deps)).toBe(0);
    expect(h.calls).toHaveLength(1);
    expect(h.out[0]).toContain(RUN_ID);
  });

  it("run --wait exits 1 when the run fails", async () => {
    const h = harness((url, init) =>
      init?.method === "POST"
        ? { status: 202, body: { run: run("queued") } }
        : {
            body: {
              run: run("failed", { error: "engine crashed" }),
              events: [],
            },
          },
    );
    expect(await runCli(["run", "tpm", "--wait"], h.deps)).toBe(1);
    expect(h.err.join("\n")).toContain("failed: engine crashed");
  });

  it("409 active run exits 1 with the API message", async () => {
    const h = harness(() => ({
      status: 409,
      body: { error: "Worker already has a run in progress" },
    }));
    expect(await runCli(["run", "tpm"], h.deps)).toBe(1);
    expect(h.err[0]).toContain("409");
    expect(h.err[0]).toContain("already has a run");
  });
});

describe("auth errors", () => {
  it.each([401, 403])("%i exits 2 with a sign-in hint", async (status) => {
    const h = harness(() => ({ status, body: { error: "Unauthorized" } }));
    expect(await runCli(["ls"], h.deps)).toBe(2);
    expect(h.err[0]).toContain(`Not authorized (${status})`);
  });

  it("5xx exits 1", async () => {
    const h = harness(() => ({
      status: 503,
      body: { error: "Database unavailable" },
    }));
    expect(await runCli(["ls"], h.deps)).toBe(1);
  });
});

describe("logs --follow", () => {
  it("polls with an incremental ?after= and stops at terminal status", async () => {
    const pages = [
      { run: run("running"), events: [event(0, "hello"), event(1, "world")] },
      { run: run("running"), events: [] },
      { run: run("succeeded"), events: [event(2, "done")] },
    ];
    let i = 0;
    const h = harness(() => ({ body: pages[i++] }));
    expect(await runCli(["logs", RUN_ID, "--follow"], h.deps)).toBe(0);
    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
    expect(afters).toEqual(["-1", "1", "1"]);
    expect(h.out).toHaveLength(3);
    expect(h.out[0]).toMatch(/message\s+hello$/);
    expect(h.out[2]).toContain("done");
    expect(h.deps.sleep).toHaveBeenCalledTimes(2);
  });

  it("drains every page of a finished run before stopping (hasMore)", async () => {
    const pages = [
      {
        run: run("succeeded"),
        events: [event(0, "a"), event(1, "b")],
        hasMore: true,
      },
      { run: run("succeeded"), events: [event(2, "c")], hasMore: false },
    ];
    let i = 0;
    const h = harness(() => ({ body: pages[i++] }));
    expect(await runCli(["logs", RUN_ID, "--follow"], h.deps)).toBe(0);
    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
    expect(afters).toEqual(["-1", "1"]);
    expect(h.out).toHaveLength(3);
    // A full page is fetched immediately, without the poll delay.
    expect(h.deps.sleep).not.toHaveBeenCalled();
  });

  it("logs without --follow drains every page (hasMore)", async () => {
    const pages = [
      {
        run: run("succeeded"),
        events: [event(0, "a"), event(1, "b")],
        hasMore: true,
      },
      { run: run("succeeded"), events: [event(2, "c")], hasMore: false },
    ];
    let i = 0;
    const h = harness(() => ({ body: pages[i++] }));
    expect(await runCli(["logs", RUN_ID], h.deps)).toBe(0);
    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
    expect(afters).toEqual(["-1", "1"]);
    expect(h.out.join("\n")).toContain("c");
    expect(h.out.join("\n").split("\n")).toHaveLength(3);
  });

  it("followRun returns the terminal run and exits 1 for cancelled", async () => {
    const h = harness(() => ({ body: { run: run("cancelled"), events: [] } }));
    const client = new Client(DEFAULT_URL, null, h.deps.fetch);
    const final = await followRun(client, RUN_ID, { sleep: h.deps.sleep });
    expect(final.status).toBe("cancelled");
    expect(await runCli(["logs", RUN_ID, "--follow"], h.deps)).toBe(1);
  });
});

describe("mutations", () => {
  it("pause / resume PATCH enabled", async () => {
    const h = harness((url, init) => ({
      body: {
        worker: worker({ enabled: JSON.parse(init?.body as string).enabled }),
      },
    }));
    expect(await runCli(["pause", "tpm"], h.deps)).toBe(0);
    expect(await runCli(["resume", "tpm"], h.deps)).toBe(0);
    expect(h.calls.map((c) => [c.init?.method, c.init?.body])).toEqual([
      ["PATCH", '{"enabled":false}'],
      ["PATCH", '{"enabled":true}'],
    ]);
  });

  it("goals add maps --project and --criteria", async () => {
    const h = harness(() => ({
      status: 201,
      body: { goal: { id: "g1", title: "Ship" } },
    }));
    expect(
      await runCli(
        [
          "goals",
          "tpm",
          "add",
          "Ship",
          "--project",
          "/w/app",
          "--criteria",
          "CI green",
        ],
        h.deps,
      ),
    ).toBe(0);
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      title: "Ship",
      projectRef: "/w/app",
      successCriteria: "CI green",
    });
  });

  it("cancel --force sends ?force=1", async () => {
    const h = harness(() => ({ body: { released: true } }));
    expect(await runCli(["cancel", RUN_ID, "--force"], h.deps)).toBe(0);
    expect(h.calls[0].init?.method).toBe("DELETE");
    expect(h.calls[0].url).toBe(
      `${DEFAULT_URL}/api/workers/runs/${RUN_ID}?force=1`,
    );
    expect(h.out[0]).toContain("Force-released");
  });

  it("goals done PATCHes status and cancel DELETEs the run", async () => {
    const h = harness(() => ({
      body: { goal: { id: "g1" }, cancelled: true },
    }));
    expect(await runCli(["goals", "tpm", "done", "g1"], h.deps)).toBe(0);
    expect(await runCli(["cancel", RUN_ID], h.deps)).toBe(0);
    expect(h.calls[0].url).toBe(`${DEFAULT_URL}/api/workers/tpm/goals/g1`);
    expect(h.calls[0].init?.body).toBe('{"status":"done"}');
    expect(h.calls[1].init?.method).toBe("DELETE");
    expect(h.calls[1].url).toBe(`${DEFAULT_URL}/api/workers/runs/${RUN_ID}`);
  });

  it("create posts the template", async () => {
    const h = harness(() => ({ status: 201, body: { worker: worker() } }));
    expect(await runCli(["create", "--template", "tpm"], h.deps)).toBe(0);
    expect(h.calls[0].init?.body).toBe('{"template":"tpm"}');
  });
});
