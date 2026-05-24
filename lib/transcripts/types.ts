/**
 * Shared types for multi-tool transcripts (Claude, Codex, Copilot).
 * See docs/building/transcript-formats.md for the on-disk formats.
 */

import { realpathSync } from "fs";
import { relative, isAbsolute } from "path";

export type TranscriptTool = "claude" | "codex" | "copilot";

/**
 * Guard against path traversal: session ids come from the URL and are joined
 * into filesystem paths by the finders. Only allow plain token characters.
 */
export function isSafeSessionId(id: string): boolean {
  // Plain token chars only, and never a ".." traversal sequence.
  return /^[A-Za-z0-9._-]+$/.test(id) && !id.includes("..");
}

/**
 * Assert that `candidate` resolves to a path inside `base`. Both are resolved
 * with realpathSync so this defeats both `..` traversal and symlink escapes in
 * one check. Returns false (deny) if either path cannot be resolved.
 *
 * Used to contain untrusted file paths read from on-disk index files
 * (e.g. Claude's sessions-index.json `fullPath`) before opening them, so a
 * crafted index entry cannot read arbitrary host files.
 */
export function isPathWithin(base: string, candidate: string): boolean {
  let baseReal: string;
  let candReal: string;
  try {
    baseReal = realpathSync(base);
    candReal = realpathSync(candidate);
  } catch {
    return false;
  }
  const rel = relative(baseReal, candReal);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export interface TranscriptSession {
  /** Globally-unique id used in the detail URL: `${tool}:${sessionId}` */
  id: string;
  /** Tool-native session id (uuid) */
  sessionId: string;
  tool: TranscriptTool;
  projectPath: string;
  projectName: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string | null;
  fullPath: string;
  size: number;
}

export interface TranscriptMessage {
  type: "user" | "assistant" | "system" | "tool_use" | "tool_result";
  content: string;
  timestamp: string;
  thinking?: string;
  toolName?: string;
  toolId?: string;
}

export interface ParseResult {
  messages: TranscriptMessage[];
  stats: {
    totalLines: number;
    parsedMessages: number;
    skippedLines: number;
    invalidJsonLines: number;
    nonMessageEntries: number;
  };
}
