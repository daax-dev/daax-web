import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseCodexJsonl,
  findCodexSessionFile,
  listCodexSessions,
} from "@/lib/transcripts/codex";
import {
  parseCopilotJsonl,
  findCopilotSessionFile,
  listCopilotSessions,
} from "@/lib/transcripts/copilot";
import { isSafeSessionId } from "@/lib/transcripts/types";

describe("isSafeSessionId / path-traversal guard", () => {
  it("accepts normal uuids and rejects traversal", () => {
    expect(isSafeSessionId("019e5ad3-c86b-7d92-a085-2b82eac9d1bc")).toBe(true);
    expect(isSafeSessionId("../../etc/passwd")).toBe(false);
    expect(isSafeSessionId("a/b")).toBe(false);
    expect(isSafeSessionId("..")).toBe(false);
  });

  it("finders return null for unsafe ids (no fs escape)", async () => {
    expect(await findCodexSessionFile("../../../etc/passwd")).toBeNull();
    expect(findCopilotSessionFile("../../../etc/passwd")).toBeNull();
  });
});

describe("parser robustness on malformed lines", () => {
  it("does not throw on null / non-object / bad json lines", () => {
    const junk = ["null", "5", '"a string"', "{not json", "[]"].join("\n");
    expect(() => parseCodexJsonl(junk)).not.toThrow();
    expect(() => parseCopilotJsonl(junk)).not.toThrow();
    expect(parseCodexJsonl(junk).messages).toHaveLength(0);
    expect(parseCopilotJsonl(junk).messages).toHaveLength(0);
  });

  it("copilot tolerates a non-array toolRequests", () => {
    const line = JSON.stringify({
      type: "assistant.message",
      data: { content: "hi", toolRequests: "oops-not-an-array" },
      timestamp: "t",
    });
    expect(() => parseCopilotJsonl(line)).not.toThrow();
    expect(parseCopilotJsonl(line).messages).toHaveLength(1); // just the assistant text
  });
});

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

describe("findCodexSessionFile exact-id match", () => {
  const tmpDirs: string[] = [];
  afterEach(async () => {
    delete process.env.CODEX_SESSIONS_DIR;
    await Promise.all(
      tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  async function setupCodexDir(filenames: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "codex-sessions-"));
    tmpDirs.push(dir);
    for (const name of filenames) {
      await writeFile(
        join(dir, name),
        JSON.stringify({ type: "session_meta", payload: { id: name } }) + "\n",
        "utf-8",
      );
    }
    process.env.CODEX_SESSIONS_DIR = dir;
    return dir;
  }

  it("matches the exact uuid suffix, not a substring", async () => {
    await setupCodexDir([
      "rollout-2025-11-29T15-38-13-019e5ad3-c86b-7d92-a085-2b82eac9d1bc.jsonl",
    ]);
    // A partial id that is merely a substring must NOT match.
    expect(await findCodexSessionFile("019e5ad3")).toBeNull();
    // The full uuid suffix matches.
    const hit = await findCodexSessionFile(
      "019e5ad3-c86b-7d92-a085-2b82eac9d1bc",
    );
    expect(hit).not.toBeNull();
    expect(hit).toContain("019e5ad3-c86b-7d92-a085-2b82eac9d1bc.jsonl");
  });
});

describe("listCopilotSessions messageCount matches detail count", () => {
  const tmpDirs: string[] = [];
  afterEach(async () => {
    delete process.env.COPILOT_SESSIONS_DIR;
    await Promise.all(
      tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  it("list messageCount equals parseCopilotJsonl(content).messages.length", async () => {
    const content = [
      JSON.stringify({
        type: "session.start",
        data: { sessionId: "c-1", startTime: "2025-11-17T23:51:57.885Z" },
        timestamp: "2025-11-17T23:51:57.888Z",
      }),
      JSON.stringify({
        type: "user.message",
        data: { content: "fix the bug" },
        timestamp: "t1",
      }),
      JSON.stringify({
        type: "assistant.message",
        data: {
          content: "Looking into it.",
          toolRequests: [
            {
              toolCallId: "tc1",
              name: "read_file",
              arguments: { path: "x.ts" },
            },
          ],
        },
        timestamp: "t2",
      }),
      // assistant with empty content + a tool request: parser emits only the tool_use.
      JSON.stringify({
        type: "assistant.message",
        data: {
          content: "",
          toolRequests: [{ toolCallId: "tc2", name: "write_file" }],
        },
        timestamp: "t3",
      }),
      JSON.stringify({
        type: "tool.execution_complete",
        data: { toolCallId: "tc1", result: "file contents" },
        timestamp: "t4",
      }),
    ].join("\n");

    const dir = await mkdtemp(join(tmpdir(), "copilot-sessions-"));
    tmpDirs.push(dir);
    await writeFile(join(dir, "c-1.jsonl"), content, "utf-8");
    // Sibling workspace dir is optional; create an empty one for realism.
    await mkdir(join(dir, "c-1"), { recursive: true });
    process.env.COPILOT_SESSIONS_DIR = dir;

    const sessions = await listCopilotSessions();
    expect(sessions).toHaveLength(1);
    const detailCount = parseCopilotJsonl(content).messages.length;
    expect(sessions[0].messageCount).toBe(detailCount);
  });

  it("skips a session whose filename-derived id is unsafe (path-segment guard)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "copilot-unsafe-"));
    tmpDirs.push(dir);
    // Filename "...jsonl" -> derived uuid ".." which isSafeSessionId rejects.
    const line = JSON.stringify({
      type: "user.message",
      data: { content: "hi" },
      timestamp: "t",
    });
    await writeFile(join(dir, "...jsonl"), line, "utf-8");
    process.env.COPILOT_SESSIONS_DIR = dir;

    expect(await listCopilotSessions()).toHaveLength(0);
  });
});

describe("listCodexSessions id derivation + messageCount", () => {
  const tmpDirs: string[] = [];
  const uuid = "019e5ad3-c86b-7d92-a085-2b82eac9d1bc";
  afterEach(async () => {
    delete process.env.CODEX_SESSIONS_DIR;
    await Promise.all(
      tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  async function writeRollout(name: string, content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "codex-list-"));
    tmpDirs.push(dir);
    await writeFile(join(dir, name), content, "utf-8");
    process.env.CODEX_SESSIONS_DIR = dir;
    return dir;
  }

  it("derives a resolvable id from the filename when session_meta is missing", async () => {
    // First line is malformed JSON, so session_meta is never parsed.
    const content = [
      "{not valid json",
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        },
      }),
    ].join("\n");
    await writeRollout(`rollout-2025-11-29T15-38-13-${uuid}.jsonl`, content);

    const sessions = await listCodexSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(uuid);
    expect(sessions[0].id).toBe(`codex:${uuid}`);
    // The derived id must resolve back to the file.
    const hit = await findCodexSessionFile(uuid);
    expect(hit).not.toBeNull();
  });

  it("skips rollout files whose name carries no uuid", async () => {
    await writeRollout(
      "rollout-no-uuid-here.jsonl",
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        },
      }),
    );
    expect(await listCodexSessions()).toHaveLength(0);
  });

  it("list messageCount equals parseCodexJsonl(content).messages.length", async () => {
    const content = [
      JSON.stringify({
        type: "session_meta",
        payload: { id: uuid, cwd: "/work/proj" },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "hi there" }],
        },
      }),
      // message with empty text — parser skips it, lister must too.
      JSON.stringify({
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [] },
      }),
      // non-user/assistant role — parser skips it.
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "system",
          content: [{ type: "text", text: "sys" }],
        },
      }),
      // non-message response_item — parser skips it.
      JSON.stringify({ type: "response_item", payload: { type: "reasoning" } }),
    ].join("\n");
    await writeRollout(`rollout-2025-11-29T15-38-13-${uuid}.jsonl`, content);

    const sessions = await listCodexSessions();
    expect(sessions).toHaveLength(1);
    const detailCount = parseCodexJsonl(content).messages.length;
    expect(sessions[0].messageCount).toBe(detailCount);
    expect(sessions[0].messageCount).toBe(2);
  });
});
