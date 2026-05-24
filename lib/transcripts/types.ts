/**
 * Shared types for multi-tool transcripts (Claude, Codex, Copilot).
 * See docs/building/transcript-formats.md for the on-disk formats.
 */

export type TranscriptTool = "claude" | "codex" | "copilot";

/**
 * Guard against path traversal: session ids come from the URL and are joined
 * into filesystem paths by the finders. Only allow plain token characters.
 */
export function isSafeSessionId(id: string): boolean {
  // Plain token chars only, and never a ".." traversal sequence.
  return /^[A-Za-z0-9._-]+$/.test(id) && !id.includes("..");
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
