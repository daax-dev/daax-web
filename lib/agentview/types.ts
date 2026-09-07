/**
 * Wire types for the dist-agent daemon (`agentd`) as it is reached through
 * `GET /api/agentview/*` — the Agent View tab's proxy.
 *
 * These mirror the daemon's protojson output. Two facts about that encoding
 * shape every consumer:
 *   - 64-bit integers arrive as JSON **strings** (`sequence`, `input_tokens`,
 *     `context_window`, ...). Parse with `Number()` at the edge, never assume
 *     a number.
 *   - Enums arrive as their full proto names (`AGENT_STATE_ACTIVE`,
 *     `CAPABILITY_LEVEL_LIMITED`). Strip the prefix for display; keep the
 *     full string for comparison.
 *
 * `UNAVAILABLE` is a value, not an absence. A signal the daemon cannot observe
 * is reported with a `detail` saying why, and the UI must render that reason
 * rather than an empty slot (dist-agent ADR 0008 §5).
 */

// ─── Capabilities ────────────────────────────────────────────────────────────

export type CapabilityLevel =
  | "CAPABILITY_LEVEL_AVAILABLE"
  | "CAPABILITY_LEVEL_LIMITED"
  | "CAPABILITY_LEVEL_UNAVAILABLE"
  | "CAPABILITY_LEVEL_UNSPECIFIED";

export interface Capability {
  level: CapabilityLevel;
  /** Why the level is what it is. Required whenever it is not AVAILABLE. */
  detail?: string;
}

export interface Capabilities {
  signals: Record<string, Capability>;
}

// ─── Node ────────────────────────────────────────────────────────────────────

export interface NodeInfo {
  node_id: string;
  hostname: string;
  node_class: string;
  os: string;
  arch: string;
  agent_version: string;
  capabilities?: Capabilities;
  started_at?: string;
  last_heartbeat?: string;
}

export type IdentityProviderState = "AVAILABLE" | "UNAVAILABLE" | string;

/**
 * The daemon's view of its OIDC provider. Both timestamps are reported so the
 * UI can render *ages* rather than a verdict; `last_attempt_at` and
 * `last_success_at` differ during an outage, and that difference is the only
 * reason the second field exists.
 */
export interface IdentityProvider {
  issuer?: string;
  state: IdentityProviderState;
  detail?: string;
  last_attempt_at?: string;
  last_success_at?: string;
}

/** `GET /api/v1/node` */
export interface NodeResponse {
  node: NodeInfo;
  identity_provider?: IdentityProvider;
}

/** `GET /api/v1/healthz` */
export interface HealthResponse {
  status: string;
  version: string;
  pid: number;
  event_count: number;
  last_sequence: number;
  data_dir: string;
  data_dir_state: string;
  data_dir_detail?: string;
  /** Present on daemons with a prompt index; counts are plain numbers. */
  prompt_index?: {
    indexed: number;
    pending: number;
    failed: number;
    unextracted: number;
  };
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export type AgentState =
  | "AGENT_STATE_ACTIVE"
  | "AGENT_STATE_WAITING"
  | "AGENT_STATE_IDLE"
  | "AGENT_STATE_STOPPED"
  | "AGENT_STATE_UNSPECIFIED";

export interface AgentStats {
  input_tokens?: string;
  output_tokens?: string;
  cache_read_tokens?: string;
  cache_creation_tokens?: string;
  total_output_tokens?: string;
  context_tokens?: string;
  context_window?: string;
  context_window_source?: string;
  context_used_percent?: number;
  turn_count?: number;
  tool_call_count?: number;
  subagent_count?: number;
  last_model_response?: string;
}

export interface AgentInstance {
  /** `node/type/session`. Contains slashes: percent-encode before putting in a path. */
  agent_id: string;
  agent_type: string;
  node_id: string;
  session_id: string;
  repository_id?: string;
  worktree_id?: string;
  cwd?: string;
  git_branch?: string;
  state: AgentState;
  model?: string;
  last_activity?: string;
  stats?: AgentStats;
  capabilities?: Capabilities;
  process_alive?: boolean;
  agent_pid?: number;
  agent_process_started_at?: string;
  project_id?: string;
  project_name?: string;
  project_source?: string;
  /** Set on subagent rows; absent (not false) on top-level sessions. */
  is_subagent?: boolean;
  parent_session_id?: string;
  spawn_depth?: number;
  subagent_type?: string;
}

/** `GET /api/v1/agents` */
export interface AgentsResponse {
  agents: AgentInstance[];
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface AgentEvent {
  event_id: string;
  node_id: string;
  timestamp: string;
  /** 64-bit: a JSON string. */
  sequence: string;
  event_type: string;
  agent_id?: string;
  session_id?: string;
  repository_id?: string;
  worktree_id?: string;
  correlation_id?: string;
  parent_event_ids?: string[];
  process_id?: number;
  parent_process_id?: number;
  attributes?: Record<string, string>;
  raw_format?: string;
  collector?: string;
}

/** `GET /api/v1/events` */
export interface EventsResponse {
  events: AgentEvent[];
  /** 64-bit: a JSON string. */
  last_sequence?: string;
}

/**
 * `GET /api/v1/stream` is server-sent events. Two event names matter:
 *   - `replay_complete` with `{ last_sequence }` once history has been replayed;
 *   - `event` with `{ stream_id, event }` for every row after that.
 */
export interface StreamEnvelope {
  stream_id: string;
  event: AgentEvent;
}

// ─── Projects and worktrees ──────────────────────────────────────────────────

export interface Project {
  project_id: string;
  project_name: string;
  project_source: string;
  node_ids: string[];
  agent_count: number;
  repository_ids: string[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface Worktree {
  worktree_id: string;
  repository_id: string;
  node_id: string;
  path: string;
  branch?: string;
  head_sha?: string;
  dirty?: boolean;
  changed_files?: string[];
  is_linked?: boolean;
  observed_at?: string;
}

export interface WorktreesResponse {
  worktrees: Worktree[];
}

// ─── Client results ──────────────────────────────────────────────────────────

/**
 * Every read through the proxy resolves to one of four outcomes, and the UI
 * must render all four differently. "Empty" is a *successful* `ok` result with
 * no rows; it is never spelled with a failure kind.
 *
 *   - `refused`     the daemon answered 401/403: it exists, and would not say.
 *   - `unreachable` the proxy could not reach the daemon at all.
 *   - `error`       anything else non-OK, including a malformed body.
 */
export type DaemonFailureKind = "refused" | "unreachable" | "error";

export type DaemonResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: DaemonFailureKind;
      status?: number;
      message: string;
    };
