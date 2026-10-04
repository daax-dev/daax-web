/**
 * The `agent-sdk` engine: Claude Agent SDK `query()` driven from the web
 * process.
 *
 * Requires ANTHROPIC_API_KEY (metered API billing). Without it the engine
 * refuses to run rather than silently falling back to another login.
 * Message shapes are the same as `claude -p --output-format stream-json`,
 * so the Claude mapper is reused.
 *
 * The SDK runs Claude Code as a child process. daax spawns that child itself
 * (`spawnClaudeCodeProcess`) so it gets the same lifecycle guarantees as the
 * CLI engines: its own process group, the run id on its command line
 * (`--session-id`), the executor reference recorded before spawn, and
 * verified cleanup at the end.
 */

import { spawn } from "node:child_process";
import { mapClaudeMessage } from "./events";
import { claudeMcpConfig, type RunPrompts, type ToolPolicy } from "./plan";
import {
  ExecutionCleanupError,
  baseChildEnv,
  hostRef,
  processStartTime,
  stopController,
  stopExecutionAndWait,
  type CliRunResult,
  type Final,
} from "./cli-runner";
import type { ResolvedMcpServer } from "./mcp";
import type { RunEvent } from "@/types/workers";

export interface SdkRunInput {
  runId: string;
  /** Fresh random UUID for this execution: the recovery marker. */
  nonce: string;
  model: string | null;
  workingDir: string;
  prompts: RunPrompts;
  policy: ToolPolicy;
  servers: ResolvedMcpServer[];
  timeoutMs: number;
  signal: AbortSignal;
  onEvent: (e: RunEvent) => Promise<void>;
  onExecutor?: (ref: string) => Promise<void>;
}

export function agentSdkAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    typeof env.ANTHROPIC_API_KEY === "string" &&
    env.ANTHROPIC_API_KEY.length > 0
  );
}

const result = (
  final: Final,
  flags: { timedOut?: boolean; cancelled?: boolean } = {},
): CliRunResult => ({
  final,
  timedOut: flags.timedOut ?? false,
  cancelled: flags.cancelled ?? false,
});

export async function runSdkEngine(input: SdkRunInput): Promise<CliRunResult> {
  if (!agentSdkAvailable()) {
    return result({
      ok: false,
      summary: null,
      error:
        "the agent-sdk engine requires ANTHROPIC_API_KEY in the daax environment",
      usage: {},
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onAbort = () => {
    cancelled = true;
    controller.abort();
  };
  // Subscribed before any await, so a cancel during the import is not lost.
  input.signal.addEventListener("abort", onAbort, { once: true });
  if (input.signal.aborted) onAbort();
  const cleanup = () => {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onAbort);
  };
  const interruptedResult = () =>
    result(
      {
        ok: false,
        summary: null,
        error: cancelled ? "cancelled" : "timed out",
        usage: {},
      },
      { timedOut, cancelled },
    );

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  if (controller.signal.aborted) {
    cleanup();
    return interruptedResult();
  }

  // Recorded before anything is spawned (bounded by cancel/deadline); if it
  // cannot be recorded, nothing starts.
  if (input.onExecutor) {
    const recorded = await Promise.race([
      input
        .onExecutor(hostRef(null, null, input.nonce))
        .then(() => "recorded" as const),
      new Promise<"aborted">((resolve) => {
        if (controller.signal.aborted) resolve("aborted");
        controller.signal.addEventListener("abort", () => resolve("aborted"), {
          once: true,
        });
      }),
    ]).catch((err) => {
      cleanup();
      throw err;
    });
    if (recorded === "aborted") {
      cleanup();
      return interruptedResult();
    }
  }

  const env: Record<string, string> = {
    ...baseChildEnv(),
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  };
  // MCP server credentials are passed per server via mcpServers, never here.

  await input.onEvent({ type: "system", text: "starting agent-sdk" });

  let ref: string | null = null;
  let pid: number | undefined;
  let killChild: () => void = () => undefined;
  const control = stopController(
    () => ref,
    () => killChild(),
  );
  controller.signal.addEventListener("abort", () => control.stop(), {
    once: true,
  });

  let final: Final | undefined;
  try {
    const stream = query({
      prompt: input.prompts.user,
      options: {
        cwd: input.workingDir,
        abortController: controller,
        // The execution nonce on the child's command line
        // (--session-id=<nonce>) is the recovery marker.
        sessionId: input.nonce,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: input.prompts.system,
        },
        settingSources: [],
        mcpServers: claudeMcpConfig(input.servers).mcpServers as never,
        allowedTools: input.policy.allowed,
        disallowedTools: input.policy.denied,
        permissionMode: "dontAsk",
        ...(input.model ? { model: input.model } : {}),
        env,
        spawnClaudeCodeProcess: (o) => {
          const child = spawn(o.command, o.args, {
            cwd: o.cwd,
            env: o.env as NodeJS.ProcessEnv,
            stdio: ["pipe", "pipe", "ignore"],
            // Own process group, like the CLI engines.
            detached: true,
          });
          pid = child.pid;
          killChild = () => child.kill("SIGTERM");
          if (pid) {
            const start = processStartTime(pid);
            ref = hostRef(pid, start, input.nonce);
            input.onExecutor?.(ref).catch(() => {
              if (!control.settled) control.stop();
            });
          }
          return child;
        },
      },
    });
    for await (const message of stream) {
      const parsed = mapClaudeMessage(message);
      for (const e of parsed.events) await input.onEvent(e);
      if (parsed.final) final = parsed.final;
    }
  } catch (err) {
    if (!timedOut && !cancelled) {
      final = {
        ok: false,
        summary: null,
        error: `agent-sdk failed: ${err instanceof Error ? err.message : String(err)}`,
        usage: {},
      };
    }
  } finally {
    cleanup();
  }

  // Verified cleanup of the SDK's child group before the run is released.
  if (pid) {
    const finalRef = `host:${pid}`;
    try {
      await stopExecutionAndWait(finalRef);
    } catch (err) {
      throw new ExecutionCleanupError(finalRef, (err as Error).message);
    }
  }
  control.settle();

  return result(
    final ?? {
      ok: false,
      summary: null,
      error: "agent-sdk ended without a result",
      usage: {},
    },
    { timedOut, cancelled },
  );
}
