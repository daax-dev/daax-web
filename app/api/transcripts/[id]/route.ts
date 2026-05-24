import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

      const entry = index.entries.find((e) => e.sessionId === sessionId);
      if (entry) {
        // Try the original path first
        if (existsSync(entry.fullPath)) {
          return entry.fullPath;
        }
        // Translate path for container mode
        // e.g., /home/jpoley/.claude/projects/xxx -> /host-claude/projects/xxx
        const match = entry.fullPath.match(/\.claude\/projects\/(.+)$/);
        if (match) {
          const containerPath = join("/host-claude/projects", match[1]);
          if (existsSync(containerPath)) {
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

interface TranscriptMessage {
  type: "user" | "assistant" | "system" | "tool_use" | "tool_result";
  content: string;
  timestamp: string;
  thinking?: string;
  toolName?: string;
  toolId?: string;
}

interface ParseResult {
  messages: TranscriptMessage[];
  stats: {
    totalLines: number;
    parsedMessages: number;
    skippedLines: number;
    invalidJsonLines: number;
    nonMessageEntries: number;
  };
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

      const timestamp = entry.timestamp || "";

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

        for (const block of contentBlocks) {
          if (block.type === "thinking" && block.thinking) {
            messages.push({
              type: "assistant",
              content: "",
              thinking: block.thinking,
              timestamp,
            });
          } else if (block.type === "text" && block.text) {
            messages.push({
              type: "assistant",
              content: block.text,
              timestamp,
            });
          } else if (block.type === "tool_use") {
            messages.push({
              type: "tool_use",
              content: JSON.stringify(block.input, null, 2),
              toolName: block.name,
              toolId: block.id,
              timestamp,
            });
          } else if (block.type === "tool_result") {
            messages.push({
              type: "tool_result",
              content:
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content),
              toolId: block.tool_use_id,
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

  const sessionFile = await findSessionFile(id);

  if (!sessionFile) {
    return NextResponse.json(
      { error: "Session not found", sessionId: id },
      { status: 404 },
    );
  }

  try {
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
    const { messages, stats } = parseJsonlToMessages(content);

    return NextResponse.json({
      sessionId: id,
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
