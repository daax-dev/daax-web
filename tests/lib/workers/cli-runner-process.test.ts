import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCliEngine } from "@/lib/workers/cli-runner";
import type { RunEvent } from "@/types/workers";

/**
 * Real child processes (no mocks): a fake `claude` that prints one result
 * line and exits at once, exercising the lifecycle races Codex r2 found.
 */
const NONCE = "11111111-2222-4333-8444-555555555555";
const dirs: string[] = [];
afterEach(() => {
  delete process.env.WORKERS_CLAUDE_BIN;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeClaude(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dw-fake-claude-"));
  dirs.push(dir);
  const bin = join(dir, "claude");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  process.env.WORKERS_CLAUDE_BIN = bin;
  return dir;
}

const base = (
  workingDir: string,
  onExecutor?: (ref: string) => Promise<void>,
) => ({
  runId: "00000000-0000-4000-8000-00000000abcd",
  nonce: NONCE,
  engine: "claude-cli" as const,
  executor: "host" as const,
  model: null,
  workingDir,
  prompts: { system: "s", user: "u" },
  policy: { allowed: [], denied: [], mcpEnabled: {} },
  servers: [],
  timeoutMs: 20_000,
  signal: new AbortController().signal,
  onEvent: async (_e: RunEvent) => undefined,
  onExecutor,
});

describe("runCliEngine lifecycle (real processes)", () => {
  it("records host:pending#<nonce> before spawning, then the real ref; a hung post-spawn write never blocks completion", async () => {
    const dir = fakeClaude(
      `echo '{"type":"result","subtype":"success","is_error":false,"result":"pong","num_turns":1}'`,
    );
    const refs: string[] = [];
    const onExecutor = (ref: string) => {
      refs.push(ref);
      // The pre-spawn write succeeds; the post-spawn update hangs forever.
      return ref === `host:pending#${NONCE}`
        ? Promise.resolve()
        : new Promise<void>(() => undefined);
    };
    const res = await runCliEngine(base(dir, onExecutor));
    expect(res.final).toMatchObject({ ok: true, summary: "pong" });
    expect(refs[0]).toBe(`host:pending#${NONCE}`);
    expect(refs[1]).toMatch(new RegExp(`^host:\\d+\\|.+#${NONCE}$`));
  }, 15_000);

  it("does not spawn if the pre-spawn reference cannot be recorded", async () => {
    const dir = fakeClaude(`touch "${"$"}PWD/spawned"; echo '{}'`);
    await expect(
      runCliEngine(base(dir, () => Promise.reject(new Error("db down")))),
    ).rejects.toThrow(/db down/);
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${dir}/spawned`)).toBe(false);
  }, 15_000);

  it("a pre-spawn write that never completes is bounded by the run's cancel/deadline", async () => {
    const dir = fakeClaude(`echo '{}'`);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const res = await runCliEngine({
      ...base(dir, () => new Promise<void>(() => undefined)),
      signal: controller.signal,
    });
    expect(res.cancelled).toBe(true);
  }, 15_000);

  it("cancel stops the whole process group", async () => {
    const dir = fakeClaude(`sleep 30 & sleep 30; wait`);
    const controller = new AbortController();
    const started = Date.now();
    const run = runCliEngine({ ...base(dir), signal: controller.signal });
    setTimeout(() => controller.abort(), 500);
    const res = await run;
    expect(res.cancelled).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);
});
