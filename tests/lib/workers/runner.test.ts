import { MAX_EVENT_TEXT } from "@/lib/workers/events";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { recentFinishedStatuses, updateWorker } = vi.hoisted(() => ({
  recentFinishedStatuses: vi.fn(),
  updateWorker: vi.fn(),
}));
vi.mock("@/lib/workers/store", () => ({
  appendRunEvent: vi.fn(),
  finishRun: vi.fn(),
  getRun: vi.fn(),
  getWorker: vi.fn(),
  listGoals: vi.fn(),
  markRunStarted: vi.fn(),
  recentFinishedStatuses,
  setExecutorRef: vi.fn(),
  updateWorker,
}));
vi.mock("@/lib/workers/cli-runner", () => ({
  baseChildEnv: vi.fn(() => ({})),
  runCliEngine: vi.fn(),
}));
vi.mock("@/lib/workers/sdk-runner", () => ({ runSdkEngine: vi.fn() }));
vi.mock("@/lib/workers/signals", () => ({ collectSignals: vi.fn() }));
vi.mock("@/lib/workers/mcp", () => ({
  listServerTools: vi.fn(),
  resolveMcpServers: vi.fn(),
}));

import {
  FAILURE_PAUSE_THRESHOLD,
  WorkingDirError,
  applyFailurePolicy,
  knownSecretValues,
  outcomeStatus,
  redactEvent,
  resolveWorkingDir,
} from "@/lib/workers/runner";
import type { CliRunResult } from "@/lib/workers/cli-runner";
import type { ResolvedMcpServer } from "@/lib/workers/mcp";
import type { Worker } from "@/types/workers";

describe("resolveWorkingDir (real filesystem)", () => {
  // tmpdir() is itself a symlink on macOS (/var → /private/var), so every
  // expectation is compared against realpaths.
  const base = realpathSync(mkdtempSync(join(tmpdir(), "daax-wd-")));
  const root = join(base, "workspace");
  const outside = join(base, "outside");
  mkdirSync(join(root, "proj", "sub"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(root, "file.txt"), "x");
  symlinkSync(outside, join(root, "escape"));
  symlinkSync(join(root, "proj"), join(root, "inner-link"));
  mkdirSync(`${root}-evil`);

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  const wd = (workingDir: string | null, r = root) =>
    resolveWorkingDir({ workingDir }, r);

  it("defaults to the (resolved) root", () => {
    expect(wd(null)).toBe(root);
    expect(wd(null, join(root, "proj", ".."))).toBe(root);
  });

  it("resolves absolute and relative paths inside the root", () => {
    expect(wd(join(root, "proj"))).toBe(join(root, "proj"));
    expect(wd("proj/sub")).toBe(join(root, "proj", "sub"));
    expect(wd("proj/../proj")).toBe(join(root, "proj"));
    expect(wd(".")).toBe(root);
  });

  it("follows symlinks that stay inside the root", () => {
    expect(wd("inner-link")).toBe(join(root, "proj"));
  });

  it("rejects a symlink that escapes the root", () => {
    expect(() => wd("escape")).toThrow(WorkingDirError);
    expect(() => wd("escape")).toThrow(/outside the workspace/);
    expect(() => wd(join(root, "escape"))).toThrow(/outside the workspace/);
  });

  it.each([
    ["absolute outside", () => outside],
    ["dot-dot", () => "../outside"],
    ["sibling prefix", () => `${root}-evil`],
  ])("rejects %s paths", (_label, path) => {
    expect(() => wd(path())).toThrow(/outside the workspace/);
  });

  it("rejects nonexistent paths, files, and a missing root", () => {
    expect(() => wd("nope")).toThrow(WorkingDirError);
    expect(() => wd("nope")).toThrow(/does not exist/);
    expect(() => wd("file.txt")).toThrow(/is not a directory/);
    expect(() => wd(null, join(base, "no-root"))).toThrow(
      /workspace root .* does not exist/,
    );
  });
});

describe("knownSecretValues / redactEvent", () => {
  const server = (env: Record<string, string>): ResolvedMcpServer => ({
    id: "s",
    type: "stdio",
    command: "x",
    env,
  });

  it("collects MCP env values and secret-named process env values (>= 4 chars, the masker's minimum)", () => {
    const values = knownSecretValues(
      [server({ GITHUB_TOKEN: "ghp_abcdefgh123", SHORT: "abc" })],
      {
        DATABASE_URL: "postgres://daax:pw@db:5432/daax",
        DAAX_WS_TOKEN_SECRET: "wstokensecret-xyz",
        MY_PASSWORD: "hunter2hunter2",
        SOME_API_KEY: "key-1234567890",
        HOME: "/home/node",
        EMPTY_TOKEN: "",
        TINY_SECRET: "1234",
        TOO_SHORT_TOKEN: "123",
      } as unknown as NodeJS.ProcessEnv,
    );
    expect(values).toEqual(
      expect.arrayContaining([
        "ghp_abcdefgh123",
        "postgres://daax:pw@db:5432/daax",
        "wstokensecret-xyz",
        "hunter2hunter2",
        "key-1234567890",
      ]),
    );
    expect(values).not.toContain("abc");
    expect(values).not.toContain("/home/node");
    // Short credentials are still redacted (Codex r2: a 7-char password
    // leaked with the old 8-char floor); below 4 chars the masker ignores it.
    expect(values).toContain("1234");
    expect(values).not.toContain("123");
  });

  it("redacts a secret before clipping, so no fragment survives at the cut", () => {
    const secret = "sk-live-0123456789abcdef";
    const text = `${"x".repeat(MAX_EVENT_TEXT - 6)}${secret}${"z".repeat(100)}`;
    const out = redactEvent({ type: "tool_result", text }, [secret]);
    // The secret straddles the clip boundary: nothing of it may survive.
    expect(out.text).not.toContain("sk-liv");
    expect(out.text).not.toContain("0123456789");
    expect(out.text!.length).toBeLessThanOrEqual(MAX_EVENT_TEXT + 40);
  });

  it("masks known values in text and nested data, leaving other fields intact", () => {
    const secret = "sup3r-s3cret-value-42";
    const e = redactEvent(
      {
        type: "tool_result",
        tool: "shell",
        text: `token=${secret} done`,
        data: {
          nested: [{ v: `x ${secret} y` }, 7, null, true],
          exitCode: 0,
        },
      },
      [secret],
    );
    expect(e.type).toBe("tool_result");
    expect(e.tool).toBe("shell");
    expect(e.text).not.toContain(secret);
    expect(e.text).toContain("[redacted]");
    expect(JSON.stringify(e.data)).not.toContain(secret);
    const d = e.data as { nested: unknown[]; exitCode: number };
    expect(d.exitCode).toBe(0);
    expect(d.nested.slice(1)).toEqual([7, null, true]);
  });

  it("masks well-known secret shapes even without known values", () => {
    const e = redactEvent(
      { type: "message", text: "key AKIAIOSFODNN7EXAMPLE" },
      [],
    );
    expect(e.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("keeps undefined text/data undefined", () => {
    expect(redactEvent({ type: "system" }, ["abcdefghij"])).toEqual({
      type: "system",
      text: undefined,
      data: undefined,
    });
  });
});

describe("outcomeStatus", () => {
  const r = (over: Partial<CliRunResult>, ok = true): CliRunResult =>
    ({
      final: { ok, summary: null, error: null, usage: {} },
      cancelled: false,
      timedOut: false,
      ...over,
    }) as CliRunResult;
  it("cancelled wins over timeout wins over result", () => {
    expect(outcomeStatus(r({ cancelled: true, timedOut: true }))).toBe(
      "cancelled",
    );
    expect(outcomeStatus(r({ timedOut: true }))).toBe("timeout");
    expect(outcomeStatus(r({}, true))).toBe("succeeded");
    expect(outcomeStatus(r({}, false))).toBe("failed");
  });
});

describe("applyFailurePolicy", () => {
  const worker = (over: Partial<Worker> = {}) =>
    ({ id: "w1", runMode: "schedule", enabled: true, ...over }) as Worker;

  beforeEach(() => {
    recentFinishedStatuses.mockReset();
    updateWorker.mockReset();
  });

  it("pauses after 3 consecutive failed/timeout runs with a reason", async () => {
    recentFinishedStatuses.mockResolvedValue(["failed", "timeout", "failed"]);
    await expect(applyFailurePolicy(worker())).resolves.toBe(true);
    expect(recentFinishedStatuses).toHaveBeenCalledWith(
      "w1",
      FAILURE_PAUSE_THRESHOLD,
    );
    expect(updateWorker).toHaveBeenCalledWith("w1", {
      enabled: false,
      pausedReason: "paused after 3 consecutive failed runs",
    });
  });

  it("continuous workers are paused too", async () => {
    recentFinishedStatuses.mockResolvedValue(["failed", "failed", "failed"]);
    await expect(
      applyFailurePolicy(worker({ runMode: "continuous" })),
    ).resolves.toBe(true);
  });

  it("adhoc workers are never paused", async () => {
    recentFinishedStatuses.mockResolvedValue(["failed", "failed", "failed"]);
    await expect(
      applyFailurePolicy(worker({ runMode: "adhoc" })),
    ).resolves.toBe(false);
    expect(updateWorker).not.toHaveBeenCalled();
  });

  it("already-disabled workers are left alone", async () => {
    recentFinishedStatuses.mockResolvedValue(["failed", "failed", "failed"]);
    await expect(applyFailurePolicy(worker({ enabled: false }))).resolves.toBe(
      false,
    );
    expect(updateWorker).not.toHaveBeenCalled();
  });

  it.each([
    [["failed", "succeeded", "failed"]],
    [["failed", "cancelled", "failed"]],
    [["failed", "failed"]],
    [[]],
  ])("mixed or short history %j is not paused", async (statuses) => {
    recentFinishedStatuses.mockResolvedValue(statuses);
    await expect(applyFailurePolicy(worker())).resolves.toBe(false);
    expect(updateWorker).not.toHaveBeenCalled();
  });
});
