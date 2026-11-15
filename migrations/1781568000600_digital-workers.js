/**
 * Digital Workers schema (docs/plans/digital-workers.md §5).
 *
 * Tables:
 *   workers           — a named worker: role instructions, engine, run policy,
 *                       autonomy, MCP server set. mcp_servers holds refs or
 *                       inline definitions with env-var NAMES only — never
 *                       secret values.
 *   worker_goals      — goals/projects a worker pursues; optional link to a
 *                       Backlog.md project path.
 *   worker_runs       — one row per run (any trigger), with status, summary,
 *                       and engine usage.
 *   worker_run_events — append-only, engine-neutral event stream per run.
 *
 * Plain CommonJS so the production image runs migrations without a TS step.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("workers", {
    id: { type: "uuid", primaryKey: true },
    slug: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    role: { type: "text", notNull: true, default: "custom" },
    description: { type: "text", notNull: true, default: "" },
    instructions: { type: "text", notNull: true, default: "" },
    engine: { type: "text", notNull: true, default: "claude-cli" },
    model: { type: "text" },
    run_mode: { type: "text", notNull: true, default: "adhoc" },
    cron: { type: "text" },
    cooldown_seconds: { type: "integer", notNull: true, default: 900 },
    max_runs_per_day: { type: "integer", notNull: true, default: 24 },
    timeout_seconds: { type: "integer", notNull: true, default: 900 },
    autonomy: { type: "text", notNull: true, default: "propose" },
    executor: { type: "text", notNull: true, default: "auto" },
    working_dir: { type: "text" },
    mcp_servers: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    enabled: { type: "boolean", notNull: true, default: false },
    paused_reason: { type: "text" },
    created_by: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("workers", "workers_engine_check", {
    check: "engine IN ('claude-cli','codex-cli','agent-sdk')",
  });
  pgm.addConstraint("workers", "workers_run_mode_check", {
    check: "run_mode IN ('schedule','adhoc','continuous')",
  });
  pgm.addConstraint("workers", "workers_autonomy_check", {
    check: "autonomy IN ('observe','propose','act')",
  });
  pgm.addConstraint("workers", "workers_executor_check", {
    check: "executor IN ('auto','host','container')",
  });

  pgm.createTable("worker_goals", {
    id: { type: "uuid", primaryKey: true },
    worker_id: {
      type: "uuid",
      notNull: true,
      references: "workers(id)",
      onDelete: "CASCADE",
    },
    title: { type: "text", notNull: true },
    description: { type: "text", notNull: true, default: "" },
    project_ref: { type: "text" },
    success_criteria: { type: "text", notNull: true, default: "" },
    status: { type: "text", notNull: true, default: "active" },
    priority: { type: "integer", notNull: true, default: 0 },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("worker_goals", "worker_goals_status_check", {
    check: "status IN ('active','done','dropped')",
  });
  pgm.createIndex("worker_goals", ["worker_id", "status"]);

  pgm.createTable("worker_runs", {
    id: { type: "uuid", primaryKey: true },
    worker_id: {
      type: "uuid",
      notNull: true,
      references: "workers(id)",
      onDelete: "CASCADE",
    },
    trigger: { type: "text", notNull: true },
    input: { type: "text", notNull: true, default: "" },
    status: { type: "text", notNull: true, default: "queued" },
    engine: { type: "text", notNull: true },
    queued_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    started_at: { type: "timestamptz" },
    finished_at: { type: "timestamptz" },
    summary: { type: "text" },
    error: { type: "text" },
    usage: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    requested_by: { type: "text" },
    // Where the run executes: "container:<name>" or "host:<pgid>". Used to
    // stop orphaned executions when a new scheduler leader takes over.
    executor_ref: { type: "text" },
    // Set by any instance; the executing leader aborts the run on its next tick.
    cancel_requested: { type: "boolean", notNull: true, default: false },
  });
  pgm.addConstraint("worker_runs", "worker_runs_status_check", {
    check:
      "status IN ('queued','running','succeeded','failed','cancelled','timeout')",
  });
  pgm.addConstraint("worker_runs", "worker_runs_trigger_check", {
    check: "trigger IN ('schedule','adhoc','continuous','cli','voice')",
  });
  pgm.createIndex("worker_runs", [
    "worker_id",
    { name: "queued_at", sort: "DESC" },
  ]);
  // At most one queued/running run per worker, enforced by the database.
  pgm.sql(
    "CREATE UNIQUE INDEX worker_runs_one_active_idx ON worker_runs (worker_id) WHERE status IN ('queued','running')",
  );

  pgm.createTable("worker_run_events", {
    id: { type: "bigserial", primaryKey: true },
    run_id: {
      type: "uuid",
      notNull: true,
      references: "worker_runs(id)",
      onDelete: "CASCADE",
    },
    seq: { type: "integer", notNull: true },
    at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    type: { type: "text", notNull: true },
    text: { type: "text" },
    tool: { type: "text" },
    data: { type: "jsonb" },
  });
  pgm.createIndex("worker_run_events", ["run_id", "seq"], { unique: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("worker_run_events");
  pgm.dropTable("worker_runs");
  pgm.dropTable("worker_goals");
  pgm.dropTable("workers");
};
