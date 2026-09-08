/**
 * Trimmed literals cut from a live agentd's answers (`/api/v1/node`,
 * `/api/v1/agents`, `/api/v1/events`), with the operator's paths scrubbed to
 * /home/dev/... . Inlined so the tests read nothing at run time.
 */

import type {
  AgentEvent,
  AgentInstance,
  NodeResponse,
} from "@/lib/agentview/types";

export const OPEN_FILES_DETAIL =
  "permanently unavailable: agents open and close files within milliseconds, so sampling cannot observe the descriptor; which files changed is answered by filesystem_observed";

export const NODE: NodeResponse = {
  identity_provider: {
    issuer: "https://auth.example.test",
    last_attempt_at: "2026-09-07T22:23:54Z",
    last_success_at: "2026-09-07T22:23:54Z",
    state: "AVAILABLE",
  },
  node: {
    node_id: "chamonix-d5d8554e",
    hostname: "chamonix.local",
    node_class: "NODE_CLASS_FULL_HOST",
    os: "darwin",
    arch: "arm64",
    agent_version: "5ff4ed3",
    started_at: "2026-09-07T20:00:00Z",
    capabilities: {
      signals: {
        git: { level: "CAPABILITY_LEVEL_AVAILABLE" },
        network_l4: {
          level: "CAPABILITY_LEVEL_LIMITED",
          detail:
            "sampled via lsof per agent process subtree; a connection opening and closing between polls is not seen, and no byte counts or durations are measured",
        },
        open_files: {
          level: "CAPABILITY_LEVEL_UNAVAILABLE",
          detail: OPEN_FILES_DETAIL,
        },
        terminal: {
          level: "CAPABILITY_LEVEL_UNAVAILABLE",
          detail: "terminal attach not implemented before phase 3",
        },
      },
    },
  },
};

export const ACTIVE_AGENT: AgentInstance = {
  agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
  agent_type: "claude",
  node_id: "chamonix-d5d8554e",
  session_id: "4db77e81-4da9-4567-a755-ad316e8df7ba",
  repository_id: "repo-35bca69adfbc2a61",
  worktree_id: "wt-f8653bc6e727f11d",
  cwd: "/home/dev/prj/jp/dist-agent",
  git_branch: "session-browser-ideas",
  state: "AGENT_STATE_ACTIVE",
  model: "claude-fable-5-1",
  last_activity: "2026-09-07T22:25:31.067Z",
  stats: {
    context_tokens: "158991",
    context_window: "200000",
    context_used_percent: 79.49549999999999,
    turn_count: 57,
    tool_call_count: 30,
  },
  process_alive: true,
  agent_pid: 40327,
  project_id: "proj-368667db2dfdaf8c",
  project_name: "jpoley/dist-agent",
  project_source: "PROJECT_SOURCE_REMOTE_URL",
};

export const IDLE_AGENT: AgentInstance = {
  agent_id: "chamonix-d5d8554e/claude/5d56d0c8-40fc-4645-9a0d-4726faa11ac0",
  agent_type: "claude",
  node_id: "chamonix-d5d8554e",
  session_id: "5d56d0c8-40fc-4645-9a0d-4726faa11ac0",
  cwd: "/home/dev/prj/jp/dist-agent",
  git_branch: "session-browser-ideas",
  state: "AGENT_STATE_IDLE",
  model: "claude-opus-5",
  last_activity: "2026-09-07T22:21:18.928Z",
  stats: { context_used_percent: 61.333000000000006 },
  project_name: "jpoley/dist-agent",
};

export const EVENTS: AgentEvent[] = [
  {
    event_id: "0bcc09177bd84e638a655d2a59da1118",
    node_id: "chamonix-d5d8554e",
    timestamp: "2026-09-07T22:25:34.332616Z",
    sequence: "1477832",
    event_type: "EVENT_TYPE_PROCESS_EXITED",
    agent_id: ACTIVE_AGENT.agent_id,
    session_id: ACTIVE_AGENT.session_id,
    process_id: 70337,
    parent_process_id: 40327,
    attributes: {
      agent_cwd: "/home/dev/prj/jp/dist-agent",
      command: "(superterm)",
      executable: "(superterm)",
    },
    collector: "process",
  },
  {
    event_id: "e354f7d29c2e16f32f8711e6d82f729f",
    node_id: "chamonix-d5d8554e",
    timestamp: "2026-09-07T22:25:34.332616Z",
    sequence: "1477834",
    event_type: "EVENT_TYPE_PROCESS_EXITED",
    agent_id: ACTIVE_AGENT.agent_id,
    session_id: ACTIVE_AGENT.session_id,
    attributes: {
      command: "bash /home/dev/.claude/hooks/gh-pr-edit-guard.sh",
      executable: "bash",
    },
    collector: "process",
  },
  {
    event_id: "aa11bb22cc33dd44ee55ff6677889900",
    node_id: "chamonix-d5d8554e",
    timestamp: "2026-09-07T22:21:18.928Z",
    sequence: "1477500",
    event_type: "EVENT_TYPE_TOOL_INVOKED",
    agent_id: IDLE_AGENT.agent_id,
    session_id: IDLE_AGENT.session_id,
    attributes: { tool_name: "Read" },
    collector: "claude",
  },
];
