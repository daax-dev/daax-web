/**
 * cli-runner: pure helpers and the early-return paths of runCliEngine. The
 * process-spawning path is not exercised here (child_process is mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cp = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const mocked = { ...actual, spawn: cp.spawn, spawnSync: cp.spawnSync };
  return { ...mocked, default: mocked };
});
vi.mock("@/server/config/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/config/constants")>()),
  HOST_WORKSPACE_PATH: "",
}));

import {
  RUN_LABEL,
  baseChildEnv,
  hostBinary,
  removeLabelledContainers,
  resolveExecutor,
  runCliEngine,
  signalExecution,
  stopController,
  type CliRunInput,
} from "@/lib/workers/cli-runner";

function input(over: Partial<CliRunInput> = {}): CliRunInput {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    nonce: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    engine: "claude-cli",
    executor: "host",
    model: null,
    workingDir: "/tmp",
    prompts: { system: "s", user: "u" },
    policy: { allowed: [], denied: [], mcpEnabled: {} },
    servers: [],
    timeoutMs: 60_000,
    signal: new AbortController().signal,
    onEvent: vi.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("runCliEngine early returns", () => {
  it("returns cancelled without spawning or emitting when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const i = input({ signal: controller.signal });
    await expect(runCliEngine(i)).resolves.toEqual({
      final: { ok: false, summary: null, error: "cancelled", usage: {} },
      timedOut: false,
      cancelled: true,
    });
    expect(cp.spawn).not.toHaveBeenCalled();
    expect(i.onEvent).not.toHaveBeenCalled();
  });

  it("the container executor without HOST_WORKSPACE_PATH fails with a clear error", async () => {
    const i = input({ executor: "container" });
    await expect(runCliEngine(i)).rejects.toThrow(
      /container executor needs daax running in container mode \(HOST_WORKSPACE_PATH is not set\)/,
    );
    expect(cp.spawn).not.toHaveBeenCalled();
  });

  it("the container check wins over an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCliEngine(input({ executor: "container", signal: controller.signal })),
    ).rejects.toThrow(/HOST_WORKSPACE_PATH/);
  });
});

describe("resolveExecutor / hostBinary / baseChildEnv", () => {
  it("auto resolves to host when daax is not in container mode", () => {
    expect(resolveExecutor("auto")).toBe("host");
    expect(resolveExecutor("host")).toBe("host");
    expect(resolveExecutor("container")).toBe("container");
  });

  it("hostBinary honours absolute overrides only", () => {
    const env = {
      WORKERS_CLAUDE_BIN: "/opt/claude",
      WORKERS_CODEX_BIN: "codex-wrapper",
    } as unknown as NodeJS.ProcessEnv;
    expect(hostBinary("claude", env)).toBe("/opt/claude");
    expect(hostBinary("codex", env)).toBe("codex");
    expect(hostBinary("docker", env)).toBe("docker");
  });

  it("baseChildEnv keeps only the base keys (no app secrets)", () => {
    expect(
      baseChildEnv({
        PATH: "/bin",
        HOME: "/home/n",
        DATABASE_URL: "postgres://x",
        DAAX_WS_TOKEN_SECRET: "s",
        ANTHROPIC_API_KEY: "k",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ PATH: "/bin", HOME: "/home/n" });
  });
});

describe("stopController", () => {
  it("SIGTERMs now and SIGKILLs after 10 s unless settled", () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      const child = vi.fn();
      const c = stopController(() => "host:4242", child);
      c.stop();
      expect(kill).toHaveBeenCalledWith(-4242, "SIGTERM");
      expect(child).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10_000);
      expect(kill).toHaveBeenCalledWith(-4242, "SIGKILL");
    } finally {
      kill.mockRestore();
      vi.useRealTimers();
    }
  });

  it("after settle(), neither the pending escalation nor a late stop() signals anything (group may be reused)", () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      const c = stopController(() => "host:4242", vi.fn());
      c.stop();
      c.settle();
      kill.mockClear();
      vi.advanceTimersByTime(20_000);
      c.stop();
      expect(kill).not.toHaveBeenCalled();
      expect(c.settled).toBe(true);
    } finally {
      kill.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("signalExecution / removeLabelledContainers", () => {
  it("removes a container by name", () => {
    signalExecution("container:daax-w-abcd", "SIGTERM");
    expect(cp.spawnSync).toHaveBeenCalledWith(
      "docker",
      ["rm", "-f", "daax-w-abcd"],
      {
        stdio: "ignore",
      },
    );
  });

  it("signals a host process group with SIGTERM", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      signalExecution("host:4242", "SIGTERM");
      expect(kill).toHaveBeenCalledWith(-4242, "SIGTERM");
    } finally {
      kill.mockRestore();
    }
  });

  it.each(["host:1", "host:0", "host:abc", "host:-5", "bogus:1"])(
    "ignores unsafe or unknown ref %s",
    (ref) => {
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
      try {
        signalExecution(ref, "SIGKILL");
        expect(kill).not.toHaveBeenCalled();
        expect(cp.spawnSync).not.toHaveBeenCalled();
      } finally {
        kill.mockRestore();
      }
    },
  );

  it("removes every container carrying the run label", () => {
    cp.spawnSync
      .mockReturnValueOnce({ status: 0, stdout: "aaa\nbbb\n" })
      .mockReturnValueOnce({ status: 0, stdout: "" });
    expect(removeLabelledContainers()).toBe(2);
    expect(cp.spawnSync).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["ps", "-aq", "--filter", `label=${RUN_LABEL}`],
      { encoding: "utf8" },
    );
    expect(cp.spawnSync).toHaveBeenNthCalledWith(
      2,
      "docker",
      ["rm", "-f", "aaa", "bbb"],
      { encoding: "utf8" },
    );
    expect(RUN_LABEL).toBe("daax.worker.run");
  });

  it("returns 0 when no labelled containers exist", () => {
    cp.spawnSync.mockReturnValueOnce({ status: 0, stdout: "" });
    expect(removeLabelledContainers()).toBe(0);
    expect(cp.spawnSync).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when docker cannot list or remove (recovery must not proceed)", () => {
    cp.spawnSync.mockReturnValueOnce({
      status: null,
      stdout: null,
      error: new Error("spawn docker ENOENT"),
    });
    expect(() => removeLabelledContainers()).toThrow(
      /cannot list worker containers/,
    );
    cp.spawnSync
      .mockReturnValueOnce({ status: 0, stdout: "aaa\n" })
      .mockReturnValueOnce({ status: 1, stderr: "daemon not running" });
    expect(() => removeLabelledContainers()).toThrow(
      /cannot remove worker containers/,
    );
  });
});
