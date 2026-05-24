/**
 * Codex CLI transcript provider.
 *
 * Sessions: ~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl
 * Lines: { type: "session_meta", payload: { id, timestamp, cwd, cli_version, ... } }
 *        { type: "response_item", payload: { type: "message", role, content: [{ type, text }] } }
 * See docs/building/transcript-formats.md.
 */

import { readFile, readdir, stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { basename, join } from "path";
import { homedir } from "os";
import type { ParseResult, TranscriptMessage, TranscriptSession } from "./types";
import { isSafeSessionId } from "./types";

/** Resolve the Codex sessions dir (env → container mount → host default). */
export function getCodexSessionsDir(): string {
  const envPath = process.env.CODEX_SESSIONS_DIR;
  if (envPath && existsSync(envPath)) return envPath;

  const containerPath = "/host-codex/sessions";
  if (existsSync(containerPath)) return containerPath;

  return join(homedir(), ".codex", "sessions");
}

/** Recursively collect rollout-*.jsonl files under the YYYY/MM/DD tree. */
async function findRolloutFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await findRolloutFiles(full)));
    } else if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string"
          ? (c as { text: string }).text
          : "",
      )
      .filter(Boolean)
      .join("");
  }
  return "";
}

/** List Codex sessions as TranscriptSession entries (metadata only). */
export async function listCodexSessions(): Promise<TranscriptSession[]> {
  const dir = getCodexSessionsDir();
  if (!existsSync(dir)) return [];

  const files = await findRolloutFiles(dir);
  const sessions: TranscriptSession[] = [];

  for (const file of files) {
    try {
      let sessionId = basename(file);
      let cwd = "";
      let created = "";
      let firstPrompt = "";
      let messageCount = 0;
      let sawLine = false;

      // Stream the rollout line-by-line so a large session never loads the
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
        if (entry.type === "session_meta" && entry.payload) {
          sessionId = entry.payload.id || sessionId;
          cwd = entry.payload.cwd || "";
          created = entry.payload.timestamp || entry.timestamp || "";
        } else if (entry.type === "response_item" && entry.payload?.type === "message") {
          messageCount++;
          if (!firstPrompt && entry.payload.role === "user") {
            firstPrompt = textFromContent(entry.payload.content).slice(0, 200);
          }
        }
      }
      if (!sawLine) continue;

      const fileStat = await stat(file);
      const modified = new Date(fileStat.mtimeMs).toISOString();
      sessions.push({
        id: `codex:${sessionId}`,
        sessionId,
        tool: "codex",
        projectPath: cwd,
        projectName: cwd ? basename(cwd) : "codex",
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
      // Skip unreadable rollout files.
    }
  }
  return sessions;
}

/** Locate the rollout file for a Codex session id. */
export async function findCodexSessionFile(sessionId: string): Promise<string | null> {
  if (!isSafeSessionId(sessionId)) return null; // reject path traversal
  const dir = getCodexSessionsDir();
  if (!existsSync(dir)) return null;
  const files = await findRolloutFiles(dir);
  // Fast path: filename embeds the uuid.
  const byName = files.find((f) => basename(f).includes(sessionId));
  if (byName) return byName;
  // Fallback: match session_meta.payload.id.
  for (const file of files) {
    try {
      const first = (await readFile(file, "utf-8")).split("\n", 1)[0];
      const meta = JSON.parse(first);
      if (meta?.payload?.id === sessionId) return file;
    } catch {
      // ignore
    }
  }
  return null;
}

/** Parse a Codex rollout JSONL into the shared message model. */
export function parseCodexJsonl(content: string): ParseResult {
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
    if (entry.type !== "response_item" || entry.payload?.type !== "message") {
      nonMessageEntries++;
      continue;
    }
    const role = entry.payload.role;
    if (role !== "user" && role !== "assistant") {
      nonMessageEntries++;
      continue;
    }
    const text = textFromContent(entry.payload.content);
    if (!text) {
      nonMessageEntries++;
      continue;
    }
    messages.push({ type: role, content: text, timestamp: entry.timestamp || "" });
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
