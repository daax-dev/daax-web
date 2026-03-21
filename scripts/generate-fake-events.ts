#!/usr/bin/env bun
/**
 * Generate realistic fake AI coding events for testing/demo purposes
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../.logs/events");
const NUM_EVENTS = 350;

// Event types with realistic distributions
const EVENT_TYPES = {
  session_start: 0.05,
  session_end: 0.05,
  tool_call: 0.25,
  file_read: 0.12,
  file_write: 0.08,
  file_edit: 0.1,
  terminal_command: 0.08,
  backlog_task_create: 0.03,
  backlog_task_update: 0.04,
  backlog_task_complete: 0.02,
  agent_spawn: 0.04,
  agent_complete: 0.04,
  code_completion: 0.05,
  error: 0.03,
  user_message: 0.02,
};

const MCP_TOOLS = [
  "mcp__github__search_code",
  "mcp__github__get_file_contents",
  "mcp__github__create_pull_request",
  "mcp__github__list_issues",
  "mcp__serena__find_symbol",
  "mcp__serena__read_file",
  "mcp__serena__replace_content",
  "mcp__serena__search_for_pattern",
  "mcp__playwright__browser_navigate",
  "mcp__playwright__browser_snapshot",
  "mcp__playwright__browser_click",
  "mcp__semgrep__scan_directory",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "Task",
  "WebSearch",
  "WebFetch",
];

const AGENTS = [
  "code-reviewer",
  "backend-engineer",
  "frontend-engineer",
  "go-expert-developer",
  "python-code-reviewer",
  "software-architect",
  "secure-by-design-engineer",
  "sre-agent",
  "Explore",
  "Plan",
];

const FILES = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/api/files/route.ts",
  "components/ui/button.tsx",
  "components/terminal/Terminal.tsx",
  "components/workflow-editor/WorkflowEditor.tsx",
  "lib/utils.ts",
  "lib/settings.ts",
  "lib/plugins/registry.ts",
  "server/terminal-server.ts",
  "hooks/useTerminal.ts",
  "types/index.ts",
  "package.json",
  "tsconfig.json",
  "tailwind.config.ts",
];

const TERMINAL_COMMANDS = [
  "bun install",
  "bun dev",
  "bun run build",
  "bun run lint",
  "bun run typecheck",
  "git status",
  "git diff",
  "git add .",
  'git commit -m "feat: update component"',
  "git push origin main",
  "docker build -t daax .",
  "docker compose up -d",
  "npm test",
  "curl localhost:4200/api/health",
];

const BACKLOG_TASKS = [
  { id: "TASK-001", title: "Implement MCP Gateway v2 plugin architecture" },
  { id: "TASK-002", title: "Add dark mode toggle to settings" },
  { id: "TASK-003", title: "Fix terminal WebSocket reconnection" },
  { id: "TASK-004", title: "Create workflow editor component" },
  { id: "TASK-005", title: "Integrate Claude Code spawner" },
  { id: "TASK-006", title: "Add file tree navigation" },
  { id: "TASK-007", title: "Implement code editor syntax highlighting" },
  { id: "TASK-008", title: "Add analytics dashboard charts" },
  { id: "TASK-009", title: "Create plugin manifest system" },
  { id: "TASK-010", title: "Fix hydration errors in SSR" },
];

const ERRORS = [
  { code: "ENOENT", message: "File not found" },
  { code: "TIMEOUT", message: "Operation timed out after 30000ms" },
  { code: "RATE_LIMIT", message: "API rate limit exceeded" },
  { code: "PARSE_ERROR", message: "Failed to parse JSON response" },
  {
    code: "CONNECTION_REFUSED",
    message: "Connection refused to localhost:4201",
  },
  { code: "AUTH_FAILED", message: "GitHub token expired or invalid" },
];

const SESSIONS: string[] = [];
const USERS = ["jason", "claude-agent", "system"];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateEventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 12)}`;
}

function weightedRandomChoice(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function generateEvent(
  timestamp: Date,
  sessionId: string,
): Record<string, unknown> {
  const eventType = weightedRandomChoice(EVENT_TYPES);
  const base = {
    id: generateEventId(),
    type: eventType,
    timestamp: timestamp.toISOString(),
    session_id: sessionId,
  };

  switch (eventType) {
    case "session_start": {
      const newSession = generateSessionId();
      SESSIONS.push(newSession);
      return {
        ...base,
        session_id: newSession,
        user: randomChoice(USERS),
        metadata: {
          workspace: process.cwd(),
          node_version: process.versions.node || "20.10.0",
          bun_version: process.versions.bun || "1.1.38",
          platform: process.platform,
        },
      };
    }

    case "session_end":
      return {
        ...base,
        duration_ms: randomInt(60000, 7200000),
        events_count: randomInt(10, 200),
        tools_used: randomInt(5, 50),
      };

    case "tool_call": {
      const tool = randomChoice(MCP_TOOLS);
      const success = Math.random() > 0.08;
      return {
        ...base,
        tool,
        success,
        duration_ms: randomInt(50, 15000),
        input_tokens: randomInt(100, 5000),
        output_tokens: success ? randomInt(50, 10000) : 0,
        ...(tool.includes("file") || tool === "Read" || tool === "Write"
          ? { file: randomChoice(FILES) }
          : {}),
        ...(!success ? { error: randomChoice(ERRORS) } : {}),
      };
    }

    case "file_read":
      return {
        ...base,
        file: randomChoice(FILES),
        lines_read: randomInt(10, 500),
        size_bytes: randomInt(200, 50000),
        duration_ms: randomInt(5, 100),
      };

    case "file_write":
      return {
        ...base,
        file: randomChoice(FILES),
        lines_written: randomInt(5, 200),
        size_bytes: randomInt(100, 20000),
        duration_ms: randomInt(10, 200),
      };

    case "file_edit":
      return {
        ...base,
        file: randomChoice(FILES),
        changes: randomInt(1, 10),
        lines_added: randomInt(0, 50),
        lines_removed: randomInt(0, 30),
        duration_ms: randomInt(20, 500),
      };

    case "terminal_command": {
      const command = randomChoice(TERMINAL_COMMANDS);
      const exitCode = Math.random() > 0.9 ? 1 : 0;
      return {
        ...base,
        command,
        exit_code: exitCode,
        duration_ms: randomInt(100, 30000),
        output_lines: randomInt(1, 100),
      };
    }

    case "backlog_task_create": {
      const task = randomChoice(BACKLOG_TASKS);
      return {
        ...base,
        task_id: task.id,
        title: task.title,
        priority: randomChoice(["high", "medium", "low"]),
        labels: [randomChoice(["feature", "bug", "enhancement", "docs"])],
      };
    }

    case "backlog_task_update": {
      const task = randomChoice(BACKLOG_TASKS);
      return {
        ...base,
        task_id: task.id,
        field: randomChoice(["status", "priority", "assignee", "labels"]),
        old_value: randomChoice(["pending", "in_progress", "blocked"]),
        new_value: randomChoice(["in_progress", "review", "testing"]),
      };
    }

    case "backlog_task_complete": {
      const task = randomChoice(BACKLOG_TASKS);
      return {
        ...base,
        task_id: task.id,
        title: task.title,
        time_spent_ms: randomInt(300000, 7200000),
        commits: randomInt(1, 5),
      };
    }

    case "agent_spawn": {
      const agent = randomChoice(AGENTS);
      return {
        ...base,
        agent_type: agent,
        agent_id: `agent_${Math.random().toString(36).slice(2, 8)}`,
        prompt_tokens: randomInt(500, 5000),
        model: randomChoice([
          "claude-sonnet-4-20250514",
          "claude-opus-4-5-20251101",
          "claude-haiku",
        ]),
      };
    }

    case "agent_complete": {
      const agent = randomChoice(AGENTS);
      const success = Math.random() > 0.05;
      return {
        ...base,
        agent_type: agent,
        agent_id: `agent_${Math.random().toString(36).slice(2, 8)}`,
        success,
        duration_ms: randomInt(5000, 120000),
        total_tokens: randomInt(2000, 50000),
        tools_called: randomInt(3, 30),
      };
    }

    case "code_completion":
      return {
        ...base,
        file: randomChoice(FILES),
        line: randomInt(1, 200),
        accepted: Math.random() > 0.3,
        latency_ms: randomInt(100, 2000),
        tokens_generated: randomInt(10, 200),
      };

    case "error": {
      const error = randomChoice(ERRORS);
      return {
        ...base,
        error_code: error.code,
        error_message: error.message,
        stack_trace:
          Math.random() > 0.5
            ? `Error: ${error.message}\n    at processEvent (/app/lib/events.ts:${randomInt(10, 200)}:${randomInt(1, 40)})`
            : undefined,
        recoverable: Math.random() > 0.3,
      };
    }

    case "user_message":
      return {
        ...base,
        message_length: randomInt(10, 500),
        has_code_block: Math.random() > 0.7,
        has_file_reference: Math.random() > 0.6,
      };

    default:
      return base;
  }
}

function generateEvents(): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];

  // Generate events spread over the last 14 days
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Start with a session
  const initialSession = generateSessionId();
  SESSIONS.push(initialSession);

  for (let i = 0; i < NUM_EVENTS; i++) {
    // Random timestamp within the last 14 days, weighted towards recent
    const weight = Math.pow(Math.random(), 0.7); // More recent events
    const timestamp = new Date(
      twoWeeksAgo.getTime() + weight * (now.getTime() - twoWeeksAgo.getTime()),
    );

    // Use existing session or occasionally start new one
    const sessionId =
      SESSIONS.length > 0 && Math.random() > 0.05
        ? randomChoice(SESSIONS)
        : generateSessionId();

    events.push(generateEvent(timestamp, sessionId));
  }

  // Sort by timestamp
  events.sort(
    (a, b) =>
      new Date(a.timestamp as string).getTime() -
      new Date(b.timestamp as string).getTime(),
  );

  return events;
}

// Main execution
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const events = generateEvents();

// Group events by date for separate files
const eventsByDate: Record<string, Record<string, unknown>[]> = {};
for (const event of events) {
  const date = (event.timestamp as string).slice(0, 10);
  if (!eventsByDate[date]) {
    eventsByDate[date] = [];
  }
  eventsByDate[date].push(event);
}

// Write events to date-based files
for (const [date, dateEvents] of Object.entries(eventsByDate)) {
  const filename = join(OUTPUT_DIR, `events-${date}.jsonl`);
  const content = dateEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filename, content);
  console.log(`Wrote ${dateEvents.length} events to ${filename}`);
}

// Also write a combined recent events file
const recentEvents = events.slice(-100);
const recentFilename = join(OUTPUT_DIR, "events-recent.jsonl");
writeFileSync(
  recentFilename,
  recentEvents.map((e) => JSON.stringify(e)).join("\n") + "\n",
);
console.log(`Wrote ${recentEvents.length} recent events to ${recentFilename}`);

console.log(
  `\nTotal: ${events.length} events generated across ${Object.keys(eventsByDate).length} days`,
);
