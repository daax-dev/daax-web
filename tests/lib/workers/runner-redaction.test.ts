import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Codex r8/r9: the execution nonce must never reach storage, whatever shape
 * the engine output takes — text, nested values, object KEYS (structured
 * tool-call arguments), summary or error. Exercised through executeRun with
 * the real mapper-to-store path; the store, MCP layer and engine are mocked.
 */
const st = vi.hoisted(() => ({
  getRun: vi.fn(),
  getWorker: vi.fn(),
  markRunStarted: vi.fn(),
  listGoals: vi.fn(),
  appendRunEvent: vi.fn(),
  setExecutorRef: vi.fn(),
  finishRun: vi.fn(),
  recentFinishedStatuses: vi.fn(),
  updateWorker: vi.fn(),
}));
vi.mock("@/lib/workers/store", () => st);

const engine = vi.hoisted(() => ({ runCliEngine: vi.fn() }));
vi.mock("@/lib/workers/cli-runner", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workers/cli-runner")>();
  return { ...actual, runCliEngine: engine.runCliEngine };
});
vi.mock("@/lib/workers/sdk-runner", () => ({ runSdkEngine: vi.fn() }));
vi.mock("@/lib/workers/signals", () => ({
  collectSignals: vi.fn(async () => ""),
}));
vi.mock("@/lib/workers/mcp", () => ({
  resolveMcpServers: () => ({ resolved: [], missing: [] }),
  listServerTools: vi.fn(),
}));
vi.mock("@/lib/workers/workspace", () => ({
  resolveWorkspaceRoot: () => process.cwd(),
}));

import { executeRun } from "@/lib/workers/runner";
import { runMarker } from "@/lib/workers/cli-runner";

const RUN = "5f0c1d7e-0000-4000-8000-0000000000f1";
const worker = {
  id: "5f0c1d7e-0000-4000-8000-0000000000aa",
  slug: "tpm",
  name: "TPM",
  instructions: "i",
  autonomy: "propose",
  engine: "claude-cli",
  executor: "host",
  model: null,
  workingDir: null,
  mcpServers: [],
  timeoutSeconds: 60,
  runMode: "adhoc",
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  st.getRun.mockResolvedValue({
    id: RUN,
    workerId: worker.id,
    status: "queued",
    trigger: "adhoc",
    input: "",
  });
  st.getWorker.mockResolvedValue(worker);
  st.markRunStarted.mockResolvedValue(true);
  st.listGoals.mockResolvedValue([]);
  st.finishRun.mockImplementation(async (_id: string, r: unknown) => r);
  st.recentFinishedStatuses.mockResolvedValue([]);
});

describe("executeRun never stores the execution nonce", () => {
  it("redacts it from text, nested values, object keys, summary and error", async () => {
    let nonce = "";
    engine.runCliEngine.mockImplementation(async (input) => {
      nonce = input.nonce;
      const marker = `(${runMarker(nonce)})`;
      await input.onEvent({
        type: "tool_call",
        tool: "mcp__backlog__task_search",
        data: {
          input: {
            filters: { [marker]: "value", q: [`--session-id ${nonce}`] },
          },
        },
      });
      // Engine-reported metadata (Codex r11): the init version string.
      await input.onEvent({
        type: "system",
        text: "session started",
        data: { version: marker },
      });
      await input.onEvent({ type: "message", text: `echo ${marker}` });
      await input.onEvent({
        type: "tool_call",
        tool: `mcp__srv__${nonce}`,
        text: `\u001b]0;${marker}\u0007`,
      });
      return {
        final: {
          ok: false,
          summary: `summary \u001b]0;${nonce}\u0007`,
          error: `error ${marker}`,
          usage: { turns: 1, note: `u ${nonce}` } as never,
        },
        timedOut: false,
        cancelled: false,
      };
    });

    await executeRun(RUN, new AbortController().signal);

    expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
    const stored = JSON.stringify([
      st.appendRunEvent.mock.calls,
      st.finishRun.mock.calls,
    ]);
    expect(stored).not.toContain(nonce);
    // The event is still there, just masked.
    expect(stored).toContain("mcp__backlog__task_search");
  });
});
