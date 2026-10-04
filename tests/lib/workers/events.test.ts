import { describe, it, expect } from "vitest";
import {
  CodexAccumulator,
  LineTail,
  MAX_EVENT_TEXT,
  clip,
  mapClaudeMessage,
  mapCodexMessage,
} from "@/lib/workers/events";

describe("clip", () => {
  it("leaves short text alone and clips long text with a remainder note", () => {
    expect(clip("abc")).toBe("abc");
    const long = "x".repeat(MAX_EVENT_TEXT + 10);
    const c = clip(long);
    expect(c.startsWith("x".repeat(MAX_EVENT_TEXT))).toBe(true);
    expect(c.endsWith("… [10 more chars]")).toBe(true);
    expect(clip("x".repeat(MAX_EVENT_TEXT))).toHaveLength(MAX_EVENT_TEXT);
  });
});

describe("mapClaudeMessage", () => {
  it("ignores non-objects and unknown types", () => {
    expect(mapClaudeMessage(null)).toEqual({ events: [] });
    expect(mapClaudeMessage("line")).toEqual({ events: [] });
    expect(mapClaudeMessage([])).toEqual({ events: [] });
    expect(mapClaudeMessage({ type: "stream_event" })).toEqual({ events: [] });
    expect(mapClaudeMessage({ type: "system", subtype: "hook" })).toEqual({
      events: [],
    });
  });

  it("maps system/init (real captured shape)", () => {
    const r = mapClaudeMessage({
      type: "system",
      subtype: "init",
      model: "claude-opus-5-5",
      mcp_servers: [],
      claude_code_version: "2.1.283",
      permissionMode: "default",
    });
    expect(r.final).toBeUndefined();
    expect(r.events).toEqual([
      {
        type: "system",
        text: "session started (model claude-opus-5-5, 0 MCP server(s))",
        data: {
          model: "claude-opus-5-5",
          mcpServers: [],
          version: "2.1.283",
          permissionMode: "default",
        },
      },
    ]);
  });

  it("maps assistant text and tool_use blocks, skipping blank text", () => {
    const r = mapClaudeMessage({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Checking tasks." },
          { type: "text", text: "   " },
          { type: "thinking", thinking: "…" },
          {
            type: "tool_use",
            id: "tu1",
            name: "mcp__backlog__task_list",
            input: { status: "To Do" },
          },
          { type: "tool_use", id: "tu2" },
        ],
      },
    });
    expect(r.events).toEqual([
      { type: "message", text: "Checking tasks." },
      {
        type: "tool_call",
        tool: "mcp__backlog__task_list",
        data: { id: "tu1", input: { status: "To Do" } },
      },
      {
        type: "tool_call",
        tool: "unknown",
        data: { id: "tu2", input: undefined },
      },
    ]);
    expect(mapClaudeMessage({ type: "assistant", message: {} })).toEqual({
      events: [],
    });
  });

  it("maps user tool_result (string and block content) without clipping (the runner clips after redaction)", () => {
    const big = "y".repeat(MAX_EVENT_TEXT * 3);
    const r = mapClaudeMessage({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "tu1", content: big },
          {
            type: "tool_result",
            tool_use_id: "tu2",
            is_error: true,
            content: [
              { type: "text", text: "line1" },
              { type: "image" },
              { type: "text", text: "line2" },
            ],
          },
          { type: "text", text: "ignored" },
        ],
      },
    });
    expect(r.events).toHaveLength(2);
    expect(r.events[0].type).toBe("tool_result");
    expect(r.events[0].text).toBe(big);
    expect(r.events[0].data).toEqual({ toolUseId: "tu1", isError: false });
    expect(r.events[1].text).toBe("line1\n\nline2");
    expect(r.events[1].data).toEqual({ toolUseId: "tu2", isError: true });
  });

  it("maps result success (real captured shape)", () => {
    const r = mapClaudeMessage({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "pong",
      num_turns: 1,
      total_cost_usd: 0.13,
      usage: { input_tokens: 2, output_tokens: 4 },
    });
    const usage = { inputTokens: 2, outputTokens: 4, costUsd: 0.13, turns: 1 };
    expect(r.events).toEqual([
      { type: "result", text: "run finished", data: usage },
    ]);
    expect(r.final).toEqual({ ok: true, summary: "pong", error: null, usage });
  });

  it("maps result errors (subtype error, is_error with success subtype, errors array)", () => {
    const a = mapClaudeMessage({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      num_turns: 30,
    });
    expect(a.final).toMatchObject({
      ok: false,
      summary: null,
      error: "error_max_turns",
    });
    expect(a.events[0].text).toBe("run failed: error_max_turns");

    const b = mapClaudeMessage({
      type: "result",
      subtype: "error_during_execution",
      errors: ["boom", "bang"],
    });
    expect(b.final?.error).toBe("boom; bang");

    const c = mapClaudeMessage({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "x",
    });
    // A failed run's result text is the error, never the summary.
    expect(c.final).toMatchObject({ ok: false, summary: null, error: "x" });

    const auth = mapClaudeMessage({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Failed to authenticate. API Error: 401 OAuth token has expired",
      num_turns: 1,
    });
    expect(auth.final).toMatchObject({
      ok: false,
      summary: null,
      error: "Failed to authenticate. API Error: 401 OAuth token has expired",
    });
    expect(auth.events[0].text).toBe(
      "run failed: Failed to authenticate. API Error: 401 OAuth token has expired",
    );

    // errors[] wins over the result text; subtype is the last resort.
    const both = mapClaudeMessage({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["e1"],
      result: "text",
    });
    expect(both.final?.error).toBe("e1");
    const bare = mapClaudeMessage({
      type: "result",
      subtype: "success",
      is_error: true,
    });
    expect(bare.final?.error).toBe("success");

    const d = mapClaudeMessage({
      type: "result",
      subtype: "success",
      usage: {},
    });
    expect(d.final?.usage).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      costUsd: undefined,
      turns: undefined,
    });
  });
});

describe("mapCodexMessage", () => {
  it("ignores non-objects, lifecycle lines and item.started", () => {
    expect(mapCodexMessage(null)).toEqual({ events: [] });
    expect(mapCodexMessage({ type: "thread.started", thread_id: "t" })).toEqual(
      { events: [] },
    );
    expect(mapCodexMessage({ type: "turn.started" })).toEqual({ events: [] });
    expect(
      mapCodexMessage({
        type: "item.started",
        item: { id: "i1", type: "command_execution" },
      }),
    ).toEqual({ events: [] });
    expect(mapCodexMessage({ type: "item.completed" })).toEqual({ events: [] });
    expect(
      mapCodexMessage({
        type: "item.completed",
        item: { type: "reasoning", text: "x" },
      }),
    ).toEqual({ events: [] });
  });

  it("maps agent_message (real captured shape)", () => {
    expect(
      mapCodexMessage({
        type: "item.completed",
        item: { id: "i2", type: "agent_message", text: "hello" },
      }),
    ).toEqual({ events: [{ type: "message", text: "hello" }] });
  });

  it("maps command_execution to call + result (real captured shape)", () => {
    expect(
      mapCodexMessage({
        type: "item.completed",
        item: {
          id: "i1",
          type: "command_execution",
          command: "/bin/zsh -lc 'cat f.txt'",
          aggregated_output: "hello\n",
          exit_code: 0,
          status: "completed",
        },
      }).events,
    ).toEqual([
      {
        type: "tool_call",
        tool: "shell",
        data: { command: "/bin/zsh -lc 'cat f.txt'" },
      },
      {
        type: "tool_result",
        tool: "shell",
        text: "hello\n",
        data: { exitCode: 0, status: "completed" },
      },
    ]);
  });

  it("maps mcp_tool_call with result, and with error fallback", () => {
    const r = mapCodexMessage({
      type: "item.completed",
      item: {
        type: "mcp_tool_call",
        server: "backlog",
        tool: "task_list",
        arguments: { status: "To Do" },
        result: { content: [{ type: "text", text: "ok" }] },
        status: "completed",
      },
    });
    expect(r.events).toEqual([
      {
        type: "tool_call",
        tool: "backlog.task_list",
        data: { arguments: { status: "To Do" } },
      },
      {
        type: "tool_result",
        tool: "backlog.task_list",
        text: JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        data: { status: "completed" },
      },
    ]);
    const e = mapCodexMessage({
      type: "item.completed",
      item: {
        type: "mcp_tool_call",
        error: { message: "denied" },
        status: "failed",
      },
    });
    expect(e.events[0].tool).toBe("mcp.?");
    expect(e.events[1].text).toBe(JSON.stringify({ message: "denied" }));
  });

  it("maps error items to a system warning (real captured shape)", () => {
    expect(
      mapCodexMessage({
        type: "item.completed",
        item: { id: "i0", type: "error", message: "warning text" },
      }),
    ).toEqual({ events: [{ type: "system", text: "warning: warning text" }] });
  });

  it("maps turn.completed usage (real captured shape)", () => {
    expect(
      mapCodexMessage({
        type: "turn.completed",
        usage: {
          input_tokens: 34024,
          cached_input_tokens: 32640,
          output_tokens: 54,
        },
      }),
    ).toEqual({
      events: [
        {
          type: "result",
          text: "turn finished",
          data: { inputTokens: 34024, outputTokens: 54 },
        },
      ],
    });
  });

  it("maps turn.failed and top-level error to error events", () => {
    expect(
      mapCodexMessage({
        type: "turn.failed",
        error: { message: "rate limited" },
      }),
    ).toEqual({
      events: [{ type: "error", text: "rate limited" }],
    });
    expect(mapCodexMessage({ type: "error", message: "stream broke" })).toEqual(
      {
        events: [{ type: "error", text: "stream broke" }],
      },
    );
    expect(mapCodexMessage({ type: "turn.failed" })).toEqual({
      events: [{ type: "error", text: "codex error" }],
    });
  });
});

describe("CodexAccumulator", () => {
  const feed = (acc: CodexAccumulator, lines: unknown[]) =>
    lines.forEach((l) => acc.add(mapCodexMessage(l)));

  it("last agent message is the summary; usage is merged", () => {
    const acc = new CodexAccumulator();
    feed(acc, [
      {
        type: "item.completed",
        item: { id: "i0", type: "error", message: "warning text" },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "first" },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "final answer" },
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 34024,
          cached_input_tokens: 32640,
          output_tokens: 54,
        },
      },
    ]);
    expect(acc.final()).toEqual({
      ok: true,
      summary: "final answer",
      error: null,
      usage: { inputTokens: 34024, outputTokens: 54 },
    });
  });

  it("fails when no agent message was produced", () => {
    const acc = new CodexAccumulator();
    feed(acc, [{ type: "turn.completed", usage: {} }]);
    expect(acc.final()).toMatchObject({
      ok: false,
      summary: null,
      error: "codex produced no answer",
    });
  });

  it("fails on turn.failed even with a message", () => {
    const acc = new CodexAccumulator();
    feed(acc, [
      {
        type: "item.completed",
        item: { type: "agent_message", text: "partial" },
      },
      { type: "turn.failed", error: { message: "quota" } },
    ]);
    expect(acc.final()).toMatchObject({
      ok: false,
      summary: "partial",
      error: "quota",
    });
  });
});

describe("LineTail", () => {
  it("keeps everything under the bound", () => {
    const t = new LineTail(100);
    t.push("a\n");
    t.push("b\n");
    expect(t.toString()).toBe("a\nb\n");
  });

  it("on overflow, drops the partial first line so no secret is left half-cut", () => {
    const t = new LineTail(25);
    t.push("sk-live-0123456789abcdef\n");
    t.push("line two\nline three\n");
    expect(t.toString()).not.toContain("0123456789");
    expect(t.toString().startsWith("line")).toBe(true);
  });

  it("keeps discarding across chunks until the overflowed line ends (Codex r4 probe)", () => {
    const t = new LineTail(16_000);
    t.push("x".repeat(16_000) + "violet-");
    t.push("password\n");
    expect(t.toString()).not.toContain("password");
    t.push("next line\n");
    expect(t.toString()).toBe("next line\n");
  });
});
