/**
 * OpenCode transcript provider.
 *
 * Storage: ~/.local/share/opencode/storage/{session,message,part}/
 *   session/<project>/ses_<id>.json — session metadata
 *   message/<sessionID>/msg_<id>.json — role + timestamps (no text)
 *   part/<messageID>/prt_<id>.json — text in type:"text" parts
 * See docs/building/transcript-formats.md.
 */

import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import type {
  ParseResult,
  TranscriptMessage,
  TranscriptSession,
} from "./types";
import { isSafeSessionId } from "./types";

interface OpenCodeSessionMeta {
  id?: string;
  directory?: string;
  title?: string;
  time?: { created?: string; updated?: string };
}

interface OpenCodeMessageMeta {
  id?: string;
  sessionID?: string;
  role?: string;
  time?: { created?: string };
}

interface OpenCodePart {
  id?: string;
  messageID?: string;
  type?: string;
  text?: string;
  tool?: string;
  name?: string;
}

/** Resolve the OpenCode storage root (env → container mount → host default). */
export function getOpenCodeStorageDir(): string {
  const envPath = process.env.OPENCODE_STORAGE_DIR;
  if (envPath && existsSync(envPath)) return envPath;

  const containerPath = "/host-opencode/storage";
  if (existsSync(containerPath)) return containerPath;

  return join(homedir(), ".local", "share", "opencode", "storage");
}

function sessionDir(storage: string): string {
  return join(storage, "session");
}

function messageDir(storage: string, sessionId: string): string {
  return join(storage, "message", sessionId);
}

function partDir(storage: string, messageId: string): string {
  return join(storage, "part", messageId);
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Collect ses_*.json session files under storage/session/<project>/. */
async function findSessionFiles(storage: string): Promise<string[]> {
  const root = sessionDir(storage);
  if (!existsSync(root)) return [];

  const out: string[] = [];
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = join(root, project.name);
    let files;
    try {
      files = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.isFile() && f.name.startsWith("ses_") && f.name.endsWith(".json")) {
        out.push(join(dir, f.name));
      }
    }
  }
  return out;
}

function messageTimestamp(msg: OpenCodeMessageMeta): string {
  return typeof msg.time?.created === "string" ? msg.time.created : "";
}

/** Map one message + its parts to TranscriptMessage entries (mirrors detail parse). */
async function messagesFromParts(
  storage: string,
  msg: OpenCodeMessageMeta,
): Promise<TranscriptMessage[]> {
  const role = msg.role;
  if (role !== "user" && role !== "assistant") return [];

  const messageId = msg.id;
  if (typeof messageId !== "string" || !messageId) return [];

  const partsDir = partDir(storage, messageId);
  if (!existsSync(partsDir)) return [];

  let partFiles;
  try {
    partFiles = await readdir(partsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const textParts: string[] = [];
  const toolParts: OpenCodePart[] = [];
  for (const pf of partFiles) {
    if (!pf.isFile() || !pf.name.endsWith(".json")) continue;
    const part = await readJsonFile<OpenCodePart>(join(partsDir, pf.name));
    if (!part) continue;
    if (part.type === "text" && typeof part.text === "string" && part.text) {
      textParts.push(part.text);
    } else if (part.type === "tool") {
      toolParts.push(part);
    }
  }

  const out: TranscriptMessage[] = [];
  const ts = messageTimestamp(msg);
  const joined = textParts.join("");
  if (joined) {
    out.push({ type: role, content: joined, timestamp: ts });
  }
  for (const tool of toolParts) {
    out.push({
      type: "tool_use",
      content:
        typeof tool.text === "string"
          ? tool.text
          : JSON.stringify(tool, null, 2),
      toolName:
        typeof tool.name === "string"
          ? tool.name
          : typeof tool.tool === "string"
            ? tool.tool
            : undefined,
      toolId: typeof tool.id === "string" ? tool.id : undefined,
      timestamp: ts,
    });
  }
  return out;
}

/** Count messages the same way parseOpenCodeSession emits them. */
async function countSessionMessages(
  storage: string,
  sessionId: string,
): Promise<number> {
  const dir = messageDir(storage, sessionId);
  if (!existsSync(dir)) return 0;

  let files;
  try {
    files = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".json")) continue;
    const msg = await readJsonFile<OpenCodeMessageMeta>(join(dir, f.name));
    if (!msg) continue;
    const emitted = await messagesFromParts(storage, msg);
    count += emitted.length;
  }
  return count;
}

/** List OpenCode sessions as TranscriptSession entries (metadata only). */
export async function listOpenCodeSessions(): Promise<TranscriptSession[]> {
  const storage = getOpenCodeStorageDir();
  const files = await findSessionFiles(storage);
  const sessions: TranscriptSession[] = [];

  for (const file of files) {
    try {
      const meta = await readJsonFile<OpenCodeSessionMeta>(file);
      if (!meta) continue;

      const sessionId =
        typeof meta.id === "string" && meta.id
          ? meta.id
          : basename(file, ".json");
      if (!isSafeSessionId(sessionId)) continue;

      const directory =
        typeof meta.directory === "string" ? meta.directory : "";
      const created =
        typeof meta.time?.created === "string" ? meta.time.created : "";
      const modified =
        typeof meta.time?.updated === "string" ? meta.time.updated : created;

      const messageCount = await countSessionMessages(storage, sessionId);

      let firstPrompt = "";
      const msgDir = messageDir(storage, sessionId);
      if (existsSync(msgDir)) {
        const msgFiles = await readdir(msgDir, { withFileTypes: true });
        const msgs: OpenCodeMessageMeta[] = [];
        for (const mf of msgFiles) {
          if (!mf.isFile() || !mf.name.endsWith(".json")) continue;
          const m = await readJsonFile<OpenCodeMessageMeta>(
            join(msgDir, mf.name),
          );
          if (m) msgs.push(m);
        }
        msgs.sort(
          (a, b) =>
            messageTimestamp(a).localeCompare(messageTimestamp(b)) ||
            String(a.id).localeCompare(String(b.id)),
        );
        for (const m of msgs) {
          if (m.role !== "user") continue;
          const emitted = await messagesFromParts(storage, m);
          const text = emitted.find((e) => e.type === "user")?.content;
          if (text) {
            firstPrompt = text.slice(0, 200);
            break;
          }
        }
      }

      const fileStat = await stat(file);
      const title = typeof meta.title === "string" ? meta.title : "";
      sessions.push({
        id: `opencode:${sessionId}`,
        sessionId,
        tool: "opencode",
        projectPath: directory,
        projectName: directory ? basename(directory) : title || "opencode",
        firstPrompt,
        summary: title,
        messageCount,
        created: created || new Date(fileStat.mtimeMs).toISOString(),
        modified: modified || new Date(fileStat.mtimeMs).toISOString(),
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

/** Locate the session metadata file for an OpenCode session id. */
export async function findOpenCodeSessionFile(
  sessionId: string,
): Promise<string | null> {
  if (!isSafeSessionId(sessionId)) return null;
  const storage = getOpenCodeStorageDir();
  const files = await findSessionFiles(storage);
  for (const file of files) {
    const meta = await readJsonFile<OpenCodeSessionMeta>(file);
    if (meta?.id === sessionId) return file;
    if (basename(file, ".json") === sessionId) return file;
  }
  return null;
}

/** Parse an OpenCode session (3-level join) into the shared message model. */
export async function parseOpenCodeSession(
  sessionId: string,
): Promise<ParseResult> {
  const storage = getOpenCodeStorageDir();
  const dir = messageDir(storage, sessionId);
  if (!existsSync(dir)) {
    return {
      messages: [],
      stats: {
        totalLines: 0,
        parsedMessages: 0,
        skippedLines: 0,
        invalidJsonLines: 0,
        nonMessageEntries: 0,
      },
    };
  }

  let files;
  try {
    files = await readdir(dir, { withFileTypes: true });
  } catch {
    return {
      messages: [],
      stats: {
        totalLines: 0,
        parsedMessages: 0,
        skippedLines: 0,
        invalidJsonLines: 0,
        nonMessageEntries: 0,
      },
    };
  }

  const messages: TranscriptMessage[] = [];
  let invalidJsonLines = 0;
  let nonMessageEntries = 0;
  const msgMetas: OpenCodeMessageMeta[] = [];

  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".json")) continue;
    const msg = await readJsonFile<OpenCodeMessageMeta>(join(dir, f.name));
    if (!msg) {
      invalidJsonLines++;
      continue;
    }
    msgMetas.push(msg);
  }

  msgMetas.sort(
    (a, b) =>
      messageTimestamp(a).localeCompare(messageTimestamp(b)) ||
      String(a.id).localeCompare(String(b.id)),
  );

  for (const msg of msgMetas) {
    const emitted = await messagesFromParts(storage, msg);
    if (emitted.length === 0) {
      nonMessageEntries++;
    }
    messages.push(...emitted);
  }

  const totalLines = files.filter(
    (f) => f.isFile() && f.name.endsWith(".json"),
  ).length;
  const skippedLines = invalidJsonLines + nonMessageEntries;

  return {
    messages,
    stats: {
      totalLines,
      parsedMessages: messages.length,
      skippedLines,
      invalidJsonLines,
      nonMessageEntries,
    },
  };
}
