import { describe, it, expect } from "vitest";
import { parseCodexJsonl } from "@/lib/transcripts/codex";
import { parseCopilotJsonl } from "@/lib/transcripts/copilot";

describe("parseCodexJsonl", () => {
  const fixture = [
    JSON.stringify({
      timestamp: "2025-11-29T15:38:13.897Z",
      type: "session_meta",
      payload: { id: "uuid-1", cwd: "/work/proj", cli_version: "0.39.0" },
    }),
    JSON.stringify({
      timestamp: "2025-11-29T15:38:15.162Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello codex" }],
      },
    }),
    JSON.stringify({
      timestamp: "2025-11-29T15:38:20.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hi there" }],
      },
    }),
    // non-message response_item (reasoning/function_call) — should be skipped
    JSON.stringify({ type: "response_item", payload: { type: "reasoning" } }),
    "not json",
  ].join("\n");

  it("extracts user and assistant messages, skips non-messages and bad json", () => {
    const { messages, stats } = parseCodexJsonl(fixture);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "user", content: "hello codex" });
    expect(messages[1]).toMatchObject({ type: "assistant", content: "hi there" });
    expect(stats.invalidJsonLines).toBe(1);
    expect(stats.nonMessageEntries).toBeGreaterThanOrEqual(2); // session_meta + reasoning
  });
});

describe("parseCopilotJsonl", () => {
  const fixture = [
    JSON.stringify({
      type: "session.start",
      data: { sessionId: "c-1", copilotVersion: "0.0.354", startTime: "2025-11-17T23:51:57.885Z" },
      id: "a",
      timestamp: "2025-11-17T23:51:57.888Z",
    }),
    JSON.stringify({ type: "session.info", data: { infoType: "mcp" }, id: "b", timestamp: "t" }),
    JSON.stringify({
      type: "user.message",
      data: { content: "fix the bug", attachments: [] },
      id: "c",
      timestamp: "2025-11-17T23:52:00.000Z",
    }),
    JSON.stringify({
      type: "assistant.message",
      data: {
        messageId: "m1",
        content: "Looking into it.",
        toolRequests: [{ toolCallId: "tc1", name: "read_file", arguments: { path: "x.ts" } }],
      },
      id: "d",
      timestamp: "2025-11-17T23:52:05.000Z",
    }),
    JSON.stringify({
      type: "tool.execution_complete",
      data: { toolCallId: "tc1", result: "file contents" },
      id: "e",
      timestamp: "2025-11-17T23:52:06.000Z",
    }),
  ].join("\n");

  it("maps user/assistant messages, tool requests, and tool results", () => {
    const { messages } = parseCopilotJsonl(fixture);
    const types = messages.map((m) => m.type);
    expect(types).toEqual(["user", "assistant", "tool_use", "tool_result"]);
    expect(messages[0].content).toBe("fix the bug");
    expect(messages[2]).toMatchObject({ type: "tool_use", toolName: "read_file", toolId: "tc1" });
    expect(messages[3]).toMatchObject({ type: "tool_result", content: "file contents", toolId: "tc1" });
  });

  it("handles empty input without throwing", () => {
    expect(parseCopilotJsonl("").messages).toHaveLength(0);
  });
});
