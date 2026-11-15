/**
 * Substrate sessions (dx#113 / #114): server-side records of persistent agent
 * sessions running as Agent Substrate actors.
 *
 * A session is a substrate Actor plus its EgressPolicy. It outlives any
 * browser tab or WebSocket; the only thing that ends it is an explicit "End
 * session" (state -> 'ended', actor + policy deleted). Rows are kept after end
 * for audit (ended_at set) and excluded from listings.
 *
 * owner_subject is the authenticated subject (the stable Pocket ID UUID, or
 * 'local' for the host-dev local operator). Ownership filtering lives in
 * lib/substrate/sessions-store.ts so multi-tenancy (dx#119) can build on it.
 *
 * Plain CommonJS so the production image runs it without a TS transform.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("substrate_sessions", {
    id: { type: "text", primaryKey: true },
    actor_name: { type: "text", notNull: true },
    atespace: { type: "text", notNull: true },
    owner_subject: { type: "text", notNull: true },
    agent: { type: "text", notNull: true },
    sandbox_class: { type: "text", notNull: true },
    template: { type: "text", notNull: true },
    egress_presets: {
      type: "text[]",
      notNull: true,
      default: pgm.func("'{}'::text[]"),
    },
    egress_hosts: {
      type: "text[]",
      notNull: true,
      default: pgm.func("'{}'::text[]"),
    },
    state: { type: "text", notNull: true },
    last_error: { type: "text" },
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
    ended_at: { type: "timestamptz" },
  });
  pgm.addConstraint("substrate_sessions", "substrate_sessions_state_check", {
    check:
      "state IN ('creating', 'running', 'suspending', 'suspended', 'resuming', 'ending', 'ended', 'error')",
  });
  // An actor name is unique per atespace among sessions that still exist.
  pgm.sql(
    "CREATE UNIQUE INDEX substrate_sessions_live_actor_idx ON substrate_sessions (atespace, actor_name) WHERE ended_at IS NULL",
  );
  pgm.sql(
    "CREATE INDEX substrate_sessions_owner_idx ON substrate_sessions (owner_subject) WHERE ended_at IS NULL",
  );
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("substrate_sessions");
};
