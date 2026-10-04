/**
 * Engine output → engine-neutral RunEvent mapping.
 *
 * `claude -p --output-format stream-json --verbose` and the Agent SDK's
 * `query()` emit the same message shapes (the SDK is Claude Code as a
 * library), so one mapper serves both. `codex exec --json` has its own
 * thread/turn/item shape. Shapes verified against claude 2.1.283,
 * @anthropic-ai/claude-agent-sdk 0.3.283 and codex-cli 0.154.0.
 */

import type { RunEvent, RunUsage } from "@/types/workers";

/**
 * Tool payloads are clipped so one large tool result cannot bloat the DB.
 * Clipping happens in the runner AFTER redaction, so a secret is never cut
 * into an unrecognisable fragment before it is masked.
 */
export const MAX_EVENT_TEXT = 4_000;

/**
 * Bounded tail of a text stream that only ever keeps whole lines at its
 * front. On overflow the partial first line is dropped, and the buffer keeps
 * discarding until the next newline even across chunks — so a secret is
 * never retained half-cut (redaction runs later, on whole lines).
 */
export class LineTail {
  private buf = "";
  private discarding = false;

  constructor(private readonly max: number) {}

  push(chunk: string): void {
    let text = chunk;
    if (this.discarding) {
      const nl = text.indexOf("\n");
      if (nl === -1) return;
      text = text.slice(nl + 1);
      this.discarding = false;
    }
    const next = this.buf + text;
    if (next.length <= this.max) {
      this.buf = next;
      return;
    }
    const tail = next.slice(-this.max);
    const nl = tail.indexOf("\n");
    if (nl === -1) {
      // The whole retained window is one partial line: drop it and keep
      // discarding until that line ends.
      this.buf = "";
      this.discarding = !next.endsWith("\n");
      return;
    }
    this.buf = tail.slice(nl + 1);
  }

  toString(): string {
    return this.buf;
  }
}

export function clip(text: string, max = MAX_EVENT_TEXT): string {
  return text.length > max
    ? `${text.slice(0, max)}… [${text.length - max} more chars]`
    : text;
}

/** What a parsed line contributed: events to store, plus a final result if seen. */
export interface ParsedLine {
  events: RunEvent[];
  final?: {
    ok: boolean;
    summary: string | null;
    error: string | null;
    usage: RunUsage;
  };
}

type Json = Record<string, unknown>;

function asObj(v: unknown): Json | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Json)
    : null;
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        asObj(c)?.type === "text" ? String(asObj(c)?.text ?? "") : "",
      )
      .join("\n");
  }
  return JSON.stringify(content ?? "");
}

/** Map one Claude (CLI stream-json or Agent SDK) message. */
export function mapClaudeMessage(msg: unknown): ParsedLine {
  const m = asObj(msg);
  if (!m) return { events: [] };
  const events: RunEvent[] = [];

  switch (m.type) {
    case "system": {
      if (m.subtype === "init") {
        const servers = Array.isArray(m.mcp_servers) ? m.mcp_servers : [];
        events.push({
          type: "system",
          text: `session started (model ${String(m.model ?? "?")}, ${servers.length} MCP server(s))`,
          data: {
            model: m.model,
            mcpServers: servers,
            version: m.claude_code_version,
            permissionMode: m.permissionMode,
          },
        });
      }
      return { events };
    }
    case "assistant": {
      const content = asObj(m.message)?.content;
      if (!Array.isArray(content)) return { events };
      for (const block of content) {
        const b = asObj(block);
        if (!b) continue;
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
          events.push({ type: "message", text: b.text });
        } else if (b.type === "tool_use") {
          events.push({
            type: "tool_call",
            tool: String(b.name ?? "unknown"),
            data: { id: b.id, input: b.input },
          });
        }
      }
      return { events };
    }
    case "user": {
      const content = asObj(m.message)?.content;
      if (!Array.isArray(content)) return { events };
      for (const block of content) {
        const b = asObj(block);
        if (b?.type === "tool_result") {
          events.push({
            type: "tool_result",
            text: toolResultText(b.content),
            data: { toolUseId: b.tool_use_id, isError: b.is_error === true },
          });
        }
      }
      return { events };
    }
    case "result": {
      const usage = asObj(m.usage) ?? {};
      const runUsage: RunUsage = {
        inputTokens: Number(usage.input_tokens ?? 0) || undefined,
        outputTokens: Number(usage.output_tokens ?? 0) || undefined,
        costUsd:
          typeof m.total_cost_usd === "number" ? m.total_cost_usd : undefined,
        turns: typeof m.num_turns === "number" ? m.num_turns : undefined,
      };
      const ok = m.subtype === "success" && m.is_error !== true;
      const errors = Array.isArray(m.errors)
        ? m.errors.map(String).join("; ")
        : "";
      const text = typeof m.result === "string" ? m.result : null;
      // A failed run's result text is the error (e.g. "OAuth session
      // expired"), not a report.
      const summary = ok ? text : null;
      const error = ok ? null : errors || text || String(m.subtype ?? "error");
      events.push({
        type: "result",
        text: ok ? "run finished" : `run failed: ${error ?? ""}`,
        data: runUsage,
      });
      return {
        events,
        final: {
          ok,
          summary,
          error,
          usage: runUsage,
        },
      };
    }
    default:
      return { events };
  }
}

/** Map one `codex exec --json` line. */
export function mapCodexMessage(msg: unknown): ParsedLine {
  const m = asObj(msg);
  if (!m) return { events: [] };
  const type = String(m.type ?? "");

  if (type === "turn.completed") {
    const u = asObj(m.usage) ?? {};
    const usage: RunUsage = {
      inputTokens: Number(u.input_tokens ?? 0) || undefined,
      outputTokens: Number(u.output_tokens ?? 0) || undefined,
    };
    return { events: [{ type: "result", text: "turn finished", data: usage }] };
  }
  if (type === "turn.failed" || type === "error") {
    const err = asObj(m.error);
    const text = String(err?.message ?? m.message ?? "codex error");
    return { events: [{ type: "error", text }] };
  }
  if (type !== "item.completed" && type !== "item.started")
    return { events: [] };

  const item = asObj(m.item);
  if (!item) return { events: [] };
  const completed = type === "item.completed";

  switch (item.type) {
    case "agent_message":
      return completed && typeof item.text === "string"
        ? { events: [{ type: "message", text: item.text }] }
        : { events: [] };
    case "command_execution":
      return completed
        ? {
            events: [
              {
                type: "tool_call",
                tool: "shell",
                data: { command: item.command },
              },
              {
                type: "tool_result",
                tool: "shell",
                text: String(item.aggregated_output ?? ""),
                data: { exitCode: item.exit_code, status: item.status },
              },
            ],
          }
        : { events: [] };
    case "mcp_tool_call":
      return completed
        ? {
            events: [
              {
                type: "tool_call",
                tool: `${String(item.server ?? "mcp")}.${String(item.tool ?? "?")}`,
                data: { arguments: item.arguments },
              },
              {
                type: "tool_result",
                tool: `${String(item.server ?? "mcp")}.${String(item.tool ?? "?")}`,
                text: JSON.stringify(item.result ?? item.error ?? null),
                data: { status: item.status },
              },
            ],
          }
        : { events: [] };
    case "error":
      // Codex reports configuration warnings as error items; they do not fail the run.
      return completed
        ? {
            events: [
              {
                type: "system",
                text: `warning: ${String(item.message ?? "")}`,
              },
            ],
          }
        : { events: [] };
    default:
      return { events: [] };
  }
}

/** Accumulates codex state across lines: the last agent message is the summary. */
export class CodexAccumulator {
  private lastMessage: string | null = null;
  private failed: string | null = null;
  private usage: RunUsage = {};

  add(parsed: ParsedLine): void {
    for (const e of parsed.events) {
      if (e.type === "message" && e.text) this.lastMessage = e.text;
      if (e.type === "error") this.failed = e.text ?? "codex error";
      if (e.type === "result")
        this.usage = { ...this.usage, ...(e.data as RunUsage) };
    }
  }

  final(): NonNullable<ParsedLine["final"]> {
    return {
      ok: this.failed === null && this.lastMessage !== null,
      summary: this.lastMessage,
      error:
        this.failed ??
        (this.lastMessage === null ? "codex produced no answer" : null),
      usage: this.usage,
    };
  }
}
