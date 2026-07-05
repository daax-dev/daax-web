/**
 * RBAC + identity + audit schema (brain2daax Phase 3, F5 — issue #101).
 *
 * Introduces daax-web's first persistent identity store. Identity is keyed on
 * the STABLE Pocket ID subject (X-Forwarded-User, an immutable OIDC UUID);
 * username/email/name are mutable display attributes stored on the row but never
 * used as the key (docs/brain2daax.md §3 F5). The email-recycle / OID-change
 * detector reference-platform carried is deliberately dropped here (§7) because
 * the key is already immutable.
 *
 * Tables:
 *   users          — JIT shadow keyed on the stable subject.
 *   roles          — named roles; permissions are a CODE catalog (lib/rbac/permissions.ts),
 *                    so there is intentionally no role_permissions table (§3 AC1 permits this).
 *   user_roles     — (subject, role) grants; granted_by distinguishes provenance
 *                    (jit-default | reconcile | group-sync | ui) so reconcile prunes
 *                    ONLY its own ('reconcile') grants and never UI grants.
 *   pending_grants — grants keyed to an email/username/subject for an allow-list
 *                    admin who has NOT logged in yet (no users row exists to FK to).
 *                    Materialised into user_roles at first login (JIT). Resolves the
 *                    fresh-DB admin-lockout tension (§3 F5 "first-admin bootstrap").
 *   auth_audit     — append-only decision log; every authz decision writes one row.
 *
 * Plain CommonJS (not TypeScript) so the production image runs migrations
 * without a TS transform step (matches the Phase 0 migrations).
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ---- users: JIT shadow keyed on the immutable Pocket ID subject ----
  pgm.createTable("users", {
    subject: { type: "text", primaryKey: true },
    username: { type: "text" },
    email: { type: "text" },
    name: { type: "text" },
    idp: { type: "text" },
    first_seen: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    last_seen: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  // Case-insensitive lookup of the mutable display attributes for allow-list /
  // pending-grant matching (never as the identity key).
  pgm.sql("CREATE INDEX users_email_lower_idx ON users (lower(email))");
  pgm.sql("CREATE INDEX users_username_lower_idx ON users (lower(username))");

  // ---- roles: named roles; permissions are code-defined (no role_permissions table) ----
  pgm.createTable("roles", {
    name: { type: "text", primaryKey: true },
    description: { type: "text" },
    is_system: { type: "boolean", notNull: true, default: false },
  });

  // Seed the two system roles. `user` is the default granted on true JIT insert;
  // `admin` is the privileged role the allow-list / reconcile bootstraps.
  // ON CONFLICT keeps `up` idempotent across a partial prior run.
  pgm.sql(
    `INSERT INTO roles (name, description, is_system) VALUES
       ('admin', 'Full administrative access to daax-web', true),
       ('user',  'Default authenticated user', true)
     ON CONFLICT (name) DO NOTHING`,
  );

  // ---- user_roles: (subject, role) grants with provenance ----
  pgm.createTable("user_roles", {
    subject: {
      type: "text",
      notNull: true,
      references: "users(subject)",
      onDelete: "CASCADE",
    },
    role: {
      type: "text",
      notNull: true,
      references: "roles(name)",
      onDelete: "CASCADE",
    },
    granted_by: { type: "text", notNull: true, default: "ui" },
    granted_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("user_roles", "user_roles_pkey", {
    primaryKey: ["subject", "role"],
  });

  // ---- pending_grants: allow-list grants for not-yet-provisioned users ----
  // identifier is a lowercased email/username OR an exact subject. NO FK — the
  // whole point is that the referenced user may not exist yet.
  pgm.createTable("pending_grants", {
    identifier: { type: "text", notNull: true },
    role: {
      type: "text",
      notNull: true,
      references: "roles(name)",
      onDelete: "CASCADE",
    },
    granted_by: { type: "text", notNull: true, default: "reconcile" },
    granted_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("pending_grants", "pending_grants_pkey", {
    primaryKey: ["identifier", "role"],
  });

  // ---- auth_audit: append-only decision log ----
  pgm.createTable("auth_audit", {
    id: { type: "bigserial", primaryKey: true },
    ts: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    event: { type: "text", notNull: true },
    subject: { type: "text" },
    permission: { type: "text" },
    route: { type: "text" },
    ip: { type: "text" },
    ua: { type: "text" },
    outcome: { type: "text", notNull: true },
    detail: { type: "text" },
  });
  pgm.sql("CREATE INDEX auth_audit_ts_desc_idx ON auth_audit (ts DESC)");
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Reverse order of creation (respect FK dependencies).
  pgm.dropTable("auth_audit");
  pgm.dropTable("pending_grants");
  pgm.dropTable("user_roles");
  pgm.dropTable("roles");
  pgm.dropTable("users");
};
