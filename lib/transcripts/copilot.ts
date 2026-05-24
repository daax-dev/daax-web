/**
 * GitHub Copilot CLI transcript provider.
 *
 * Sessions: ~/.copilot/session-state/<uuid>.jsonl (event stream)
 * Lines: { type, data, id, timestamp, parentId }
 *   session.start    data: { sessionId, copilotVersion, startTime }
 *   user.message     data: { content, attachments }
 *   assistant.message data: { messageId, content, toolRequests: [{ toolCallId, name, arguments }] }
 *   tool.execution_complete / tool.execution_start
 * Project cwd: sibling ~/.copilot/session-state/<uuid>/workspace.yaml
 * See docs/building/transcript-formats.md.
 */

import { readFile, readdir, stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { basename, join } from "path";
import { homedir } from "os";
import type { ParseResult, TranscriptMessage, TranscriptSession } from "./types";
import { isSafeSessionId } from "./types";

/** Resolve the Copilot session-state dir (env → container mount → host default). */
export function getCopilotSessionsDir(): string {
  const envPath = process.env.COPILOT_SESSIONS_DIR;
  if (envPath && existsSync(envPath)) return envPath;

  const containerPath = "/host-copilot/session-state";
  if (existsSync(containerPath)) return containerPath;

  return join(homedir(), ".copilot", "session-state");
}

/** Best-effort cwd from the sibling <uuid>/workspace.yaml (first `cwd:`/`path:` line). */
async function readWorkspaceCwd(dir: string, uuid: string): Promise<string> {
  const yaml = join(dir, uuid, "workspace.yaml");
  if (!existsSync(yaml)) return "";
  try {
    const content = await readFile(yaml, "utf-8");
    const m = content.match(/^(?:cwd|path|directory):\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

/** List Copilot sessions as TranscriptSession entries (metadata only). */
export async function listCopilotSessions(): Promise<TranscriptSession[]> {
  const dir = getCopilotSessionsDir();
  if (!existsSync(dir)) return [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessions: TranscriptSession[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
    const file = join(dir, e.name);
    const uuid = e.name.replace(/\.jsonl$/, "");
    try {
      let created = "";
      let firstPrompt = "";
      let messageCount = 0;
      let sawLine = false;

      // Stream the event log line-by-line so a long session never loads the
      // whole file (plus a split array) into memory at once.
      const rl = createInterface({
        input: createReadStream(file, "utf-8"),
        crlfDelay: Infinity,
      });
      for await (const raw of rl) {
        const line = raw.trim();
        if (!line) continue;
        sawLine = true;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        if (!entry || typeof entry !== "object") continue;
        if (entry.type === "session.start") {
          created = entry.data?.startTime || entry.timestamp || "";
        } else if (entry.type === "user.message") {
          messageCount++;
          if (!firstPrompt) firstPrompt = String(entry.data?.content ?? "").slice(0, 200);
        } else if (entry.type === "assistant.message") {
          messageCount++;
        }
      }
      if (!sawLine) continue;

      const cwd = await readWorkspaceCwd(dir, uuid);
      const fileStat = await stat(file);
      const modified = new Date(fileStat.mtimeMs).toISOString();
      sessions.push({
        id: `copilot:${uuid}`,
        sessionId: uuid,
        tool: "copilot",
        projectPath: cwd,
        projectName: cwd ? basename(cwd) : "copilot",
        firstPrompt,
        summary: "",
        messageCount,
        created: created || modified,
        modified,
        gitBranch: null,
        fullPath: file,
        size: fileStat.size,
      });
    } catch {
      // Skip unreadable session files.
    }
  }
  return sessions;
}

/** Locate the session-state file for a Copilot session id. */
export function findCopilotSessionFile(sessionId: string): string | null {
  if (!isSafeSessionId(sessionId)) return null; // reject path traversal
  const dir = getCopilotSessionsDir();
  const file = join(dir, `${sessionId}.jsonl`);
  return existsSync(file) ? file : null;
}

/** Parse a Copilot event-stream JSONL into the shared message model. */
export function parseCopilotJsonl(content: string): ParseResult {
  const messages: TranscriptMessage[] = [];
  const lines = content.split("\n").filter((l) => l.trim());
  let invalidJsonLines = 0;
  let nonMessageEntries = 0;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      invalidJsonLines++;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      nonMessageEntries++;
      continue;
    }
    const ts = entry.timestamp || "";
    if (entry.type === "user.message") {
      messages.push({ type: "user", content: String(entry.data?.content ?? ""), timestamp: ts });
    } else if (entry.type === "assistant.message") {
      const content_ = String(entry.data?.content ?? "");
      if (content_) messages.push({ type: "assistant", content: content_, timestamp: ts });
      const toolRequests = Array.isArray(entry.data?.toolRequests) ? entry.data.toolRequests : [];
      for (const req of toolRequests) {
        messages.push({
          type: "tool_use",
          content: JSON.stringify(req.arguments ?? {}, null, 2),
          toolName: req.name,
          toolId: req.toolCallId,
          timestamp: ts,
        });
      }
    } else if (entry.type === "tool.execution_complete") {
      messages.push({
        type: "tool_result",
        content:
          typeof entry.data?.result === "string"
            ? entry.data.result
            : JSON.stringify(entry.data?.result ?? entry.data ?? {}),
        toolId: entry.data?.toolCallId,
        timestamp: ts,
      });
    } else {
      nonMessageEntries++;
    }
  }

  const skippedLines = invalidJsonLines + nonMessageEntries;
  return {
    messages,
    stats: {
      totalLines: lines.length,
      parsedMessages: messages.length,
      skippedLines,
      invalidJsonLines,
      nonMessageEntries,
    },
  };
}
