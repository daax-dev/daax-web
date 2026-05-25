// AI Session types for multi-session AI coding

export type AIAgent =
  | "claude-code"
  | "github-copilot"
  | "kiro-cli"
  | "openai-codex"
  | "google-gemini"
  | "opencode";

export type SessionStatus = "starting" | "running" | "stopped" | "error";

export interface AISession {
  id: string;
  agent: AIAgent;
  containerId?: string;
  containerImage: string;
  workingDirectory: string;
  status: SessionStatus;
  createdAt: string;
  ptyId?: string;
  error?: string;
  /** Optional custom session name for display */
  name?: string;
}

export interface CreateSessionRequest {
  agent: AIAgent;
  containerImage?: string; // Override default
  workingDirectory: string;
}

export type SplitLayout = "single" | "split-vertical" | "split-horizontal";

export interface AITabState {
  sessions: AISession[];
  activeSessionId: string | null;
  layout: SplitLayout;
  splitRatio: number;
}

// Placeholder images for each agent (used in UI when no image is explicitly provided).
// All agents use the same base image (daax-agents-core) which includes all AI CLIs.
// NOTE: The actual server-side default is in DEFAULT_AI_CODING_SETTINGS.defaultContainerImage
// (currently gsd variant). These values are for UI display only as placeholders.
// Users can override per-session via the modal or globally via settings.
export const DEFAULT_AGENT_CONTAINER_IMAGE = "jpoley/daax-agents-core:latest";

export const DEFAULT_CONTAINER_IMAGES: Record<AIAgent, string> = {
  "claude-code": DEFAULT_AGENT_CONTAINER_IMAGE,
  "github-copilot": DEFAULT_AGENT_CONTAINER_IMAGE,
  "kiro-cli": DEFAULT_AGENT_CONTAINER_IMAGE,
  "openai-codex": DEFAULT_AGENT_CONTAINER_IMAGE,
  "google-gemini": DEFAULT_AGENT_CONTAINER_IMAGE,
  opencode: DEFAULT_AGENT_CONTAINER_IMAGE,
};

// Agent metadata for UI
export const AI_AGENTS: Record<
  AIAgent,
  { name: string; command: string; icon: string }
> = {
  "claude-code": { name: "Claude Code", command: "claude", icon: "Bot" },
  "github-copilot": {
    name: "GitHub Copilot",
    command: "copilot",
    icon: "Github",
  },
  "kiro-cli": { name: "Kiro CLI", command: "kiro", icon: "Sparkles" },
  "openai-codex": { name: "OpenAI Codex", command: "codex", icon: "Zap" },
  "google-gemini": { name: "Google Gemini", command: "gemini", icon: "Gem" },
  opencode: { name: "OpenCode", command: "opencode", icon: "Code" },
};
