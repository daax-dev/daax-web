import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { findCodexSessionFile, parseCodexJsonl } from "@/lib/transcripts/codex";
import {
  findCopilotSessionFile,
  parseCopilotJsonl,
} from "@/lib/transcripts/copilot";
import type { ParseResult, TranscriptMessage } from "@/lib/transcripts/types";
import { isPathWithin } from "@/lib/transcripts/types";

// Get Claude projects directory
function getClaudeProjectsDir(): string {
  const envPath = process.env.CLAUDE_PROJECTS_DIR;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const containerPath = "/host-claude/projects";
  if (existsSync(containerPath)) {
    return containerPath;
  }

  return join(homedir(), ".claude", "projects");
}

interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
}

interface SessionIndex {
  version: number;
  entries: SessionIndexEntry[];
}

/**
 * sessions-index.json is untrusted on-disk content. Validate that an entry is
 * an object carrying the string fields this route relies on before using it,
 * so a malformed index (non-array entries, null/number elements, missing
 * fields) is skipped rather than throwing.
 */
function isValidIndexEntry(e: unknown): e is SessionIndexEntry {
  return (
    !!e &&
    typeof e === "object" &&
    typeof (e as SessionIndexEntry).sessionId === "string" &&
    typeof (e as SessionIndexEntry).fullPath === "string"
  );
}

// Find session JSONL file by ID across all projects
async function findSessionFile(sessionId: string): Promise<string | null> {
  const projectsDir = getClaudeProjectsDir();

  if (!existsSync(projectsDir)) {
    return null;
  }

  const projectDirs = await readdir(projectsDir, { withFileTypes: true });

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;

    const indexPath = join(projectsDir, projectDir.name, "sessions-index.json");
    if (!existsSync(indexPath)) continue;

    try {
      const indexContent = await readFile(indexPath, "utf-8");
      const index: SessionIndex = JSON.parse(indexContent);

      if (!Array.isArray(index.entries)) continue;
      const entry = index.entries.find(
        (e) => isValidIndexEntry(e) && e.sessionId === sessionId,
      );
      if (entry) {
        // entry.fullPath is untrusted on-disk index content: contain it to the
        // configured Claude projects dir before reading, so a crafted index can
        // never point the read at an arbitrary host file (path traversal).
        if (
          existsSync(entry.fullPath) &&
          isPathWithin(projectsDir, entry.fullPath)
        ) {
          return entry.fullPath;
        }
        // Translate path for container mode
        // e.g., /home/jpoley/.claude/projects/xxx -> /host-claude/projects/xxx
        // match[1] is likewise untrusted (could contain `..`), so the joined
        // candidate is also containment-checked before being returned.
        const match = entry.fullPath.match(/\.claude\/projects\/(.+)$/);
        if (match) {
          const containerPath = join("/host-claude/projects", match[1]);
          if (
            existsSync(containerPath) &&
            isPathWithin("/host-claude/projects", containerPath)
          ) {
            return containerPath;
          }
        }
      }
    } catch {
      // Skip this project
    }
  }

  return null;
}

// Parse JSONL file into structured messages with tracking of skipped entries
function parseJsonlToMessages(content: string): ParseResult {
  const messages: TranscriptMessage[] = [];
  const lines = content.split("\n").filter((line) => line.trim());

  let invalidJsonLines = 0;
  let nonMessageEntries = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Skip non-message entries
      if (!entry.type || !["user", "assistant"].includes(entry.type)) {
        nonMessageEntries++;
        continue;
      }

      // timestamp is untrusted JSON; only accept string values into the typed
      // TranscriptMessage.timestamp.
      const timestamp =
        typeof entry.timestamp === "string" ? entry.timestamp : "";

      if (entry.type === "user" && entry.message?.content) {
        messages.push({
          type: "user",
          content:
            typeof entry.message.content === "string"
              ? entry.message.content
              : JSON.stringify(entry.message.content),
          timestamp,
        });
      } else if (entry.type === "assistant" && entry.message?.content) {
        // Process assistant message content blocks
        const contentBlocks = Array.isArray(entry.message.content)
          ? entry.message.content
          : [{ type: "text", text: entry.message.content }];

        // Content-block fields are untrusted JSON; guard each typed string field
        // so malformed JSONL can't inject non-strings into TranscriptMessage.
        for (const block of contentBlocks) {
          if (
            block.type === "thinking" &&
            typeof block.thinking === "string" &&
            block.thinking
          ) {
            messages.push({
              type: "assistant",
              content: "",
              thinking: block.thinking,
              timestamp,
            });
          } else if (
            block.type === "text" &&
            typeof block.text === "string" &&
            block.text
          ) {
            messages.push({
              type: "assistant",
              content: block.text,
              timestamp,
            });
          } else if (block.type === "tool_use") {
            messages.push({
              type: "tool_use",
              content: JSON.stringify(block.input, null, 2),
              toolName: typeof block.name === "string" ? block.name : undefined,
              toolId: typeof block.id === "string" ? block.id : undefined,
              timestamp,
            });
          } else if (block.type === "tool_result") {
            messages.push({
              type: "tool_result",
              content:
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content),
              toolId:
                typeof block.tool_use_id === "string"
                  ? block.tool_use_id
                  : undefined,
              timestamp,
            });
          }
        }
      } else {
        // Valid JSON but missing expected content structure
        nonMessageEntries++;
      }
    } catch {
      // Track invalid JSON lines for debugging
      invalidJsonLines++;
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[parseJsonl] Skipped invalid JSON line: ${line.slice(0, 100)}...`,
        );
      }
    }
  }

  const skippedLines = invalidJsonLines + nonMessageEntries;

  // Log warning in development when significant portion of file can't be parsed
  if (process.env.NODE_ENV === "development" && lines.length > 0) {
    const skipRatio = skippedLines / lines.length;
    if (skipRatio > 0.5) {
      console.warn(
        `[parseJsonl] Warning: ${Math.round(skipRatio * 100)}% of lines skipped ` +
          `(${invalidJsonLines} invalid JSON, ${nonMessageEntries} non-message entries)`,
      );
    }
  }

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";

  // Ids are `${tool}:${sessionId}`. Bare ids (no recognized prefix) default to
  // Claude for backward compatibility. Dispatch discovery + parsing per tool.
  let tool = "claude";
  let nativeId = id;
  const sep = id.indexOf(":");
  if (sep !== -1) {
    const prefix = id.slice(0, sep);
    if (prefix === "claude" || prefix === "codex" || prefix === "copilot") {
      tool = prefix;
      nativeId = id.slice(sep + 1);
    }
  }

  let sessionFile: string | null;
  let parse: (content: string) => ParseResult;
  if (tool === "codex") {
    sessionFile = await findCodexSessionFile(nativeId);
    parse = parseCodexJsonl;
  } else if (tool === "copilot") {
    sessionFile = findCopilotSessionFile(nativeId);
    parse = parseCopilotJsonl;
  } else {
    sessionFile = await findSessionFile(nativeId);
    parse = parseJsonlToMessages;
  }

  if (!sessionFile) {
    return NextResponse.json(
      { error: "Session not found", sessionId: id },
      { status: 404 },
    );
  }

  try {
    // Full read is intentional here: a detail view renders every message in a
    // single session, so the whole file is needed regardless. Unlike the
    // listing (which streams to scan many files for metadata), this is bounded
    // to one user-selected session, so loading it once is acceptable.
    const content = await readFile(sessionFile, "utf-8");

    if (format === "raw") {
      // Return raw JSONL
      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    }

    // Parse and return structured messages with stats
    const { messages, stats } = parse(content);

    return NextResponse.json({
      // Bare native id (no `${tool}:` prefix), matching the list route's
      // TranscriptSession.sessionId; `tool` is exposed as its own field.
      sessionId: nativeId,
      tool,
      path: sessionFile,
      messageCount: messages.length,
      messages,
      parseStats: stats,
    });
  } catch (error) {
    console.error(`Error reading session ${sessionFile}:`, error);
    return NextResponse.json(
      { error: "Failed to read session", sessionId: id },
      { status: 500 },
    );
  }
}
