import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The agent-sdk engine with a mocked query(): the mock calls the engine's own
 * spawnClaudeCodeProcess (a real detached child) and yields a result, so the
 * lifecycle guarantees are exercised with real processes.
 */
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);

import { runSdkEngine } from "@/lib/workers/sdk-runner";

const RUN = "5f0c1d7e-0000-4000-8000-00000000d00d";
const NONCE = "11111111-2222-4333-8444-66666666d00d";
const base = () => ({
  runId: RUN,
  nonce: NONCE,
  model: null,
  workingDir: process.cwd(),
  prompts: { system: "s", user: "u" },
  policy: { allowed: [], denied: [], mcpEnabled: {} },
  servers: [],
  timeoutMs: 20_000,
  signal: new AbortController().signal,
  onEvent: async () => undefined,
});

type SpawnFn = (o: {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
}) => { pid?: number };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-test-key-for-unit-tests";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  sdk.query.mockReset();
});

describe("runSdkEngine", () => {
  it("refuses to run without ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await runSdkEngine(base());
    expect(res.final.ok).toBe(false);
    expect(res.final.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it("records host:pending before spawning, passes the execution nonce as sessionId, spawns in its own group and verifies cleanup", async () => {
    let options: { sessionId?: string; spawnClaudeCodeProcess?: SpawnFn } = {};
    let childPid: number | undefined;
    sdk.query.mockImplementation(({ options: o }) => {
      options = o;
      return (async function* () {
        const child = o.spawnClaudeCodeProcess({
          command: "sh",
          args: ["-c", `sleep 30 & sleep 30; : ${RUN}`],
          cwd: process.cwd(),
          env: { PATH: process.env.PATH },
        });
        childPid = child.pid;
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          num_turns: 1,
        };
      })();
    });
    const refs: string[] = [];
    const res = await runSdkEngine({
      ...base(),
      onExecutor: async (r: string) => void refs.push(r),
    });
    expect(options.sessionId).toBe(NONCE);
    expect(refs[0]).toBe(`host:pending#${NONCE}`);
    expect(refs[1]).toMatch(new RegExp(`^host:${childPid}\\|.+#${NONCE}$`));
    expect(res.final).toMatchObject({ ok: true, summary: "done" });
    // The whole group (including the backgrounded sleep) is gone.
    expect(() => process.kill(-(childPid as number), 0)).toThrow();
  }, 30_000);

  it("does not start the SDK if the pre-spawn reference cannot be recorded", async () => {
    await expect(
      runSdkEngine({
        ...base(),
        onExecutor: () => Promise.reject(new Error("db down")),
      }),
    ).rejects.toThrow(/db down/);
    expect(sdk.query).not.toHaveBeenCalled();
  });
});
