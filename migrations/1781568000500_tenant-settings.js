/**
 * Server-side, per-user security settings (multi-tenancy — dx#119).
 *
 * Security-relevant settings (agent container image, workspace basePath,
 * Claude --dangerously-skip-permissions, workspace mount root) used to live in
 * each browser's localStorage, so any user could set any value. They now live
 * here; the app resolves the effective values (lib/tenancy/settings-policy.ts)
 * and signs them into the WS ticket the terminal server enforces.
 *
 * Tables:
 *   user_settings   — one row per subject. `settings` is what the user chose
 *                     (only unlocked, user-editable keys are honoured);
 *                     `admin_overrides` is what an admin set for that user
 *                     (e.g. a per-user mountRoot) and always wins.
 *   settings_policy — a single row (id = 1): admin `defaults` and the `locks`
 *                     list of keys users may not change.
 *
 * No data is migrated: every existing browser keeps its localStorage values as
 * a UI cache, and a user without a row resolves to the admin defaults.
 * Down drops both tables (reversible; no other table references them).
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
  pgm.createTable("user_settings", {
    subject: {
      type: "text",
      primaryKey: true,
      references: "users",
      onDelete: "CASCADE",
    },
    settings: { type: "jsonb", notNull: true, default: "{}" },
    admin_overrides: { type: "jsonb", notNull: true, default: "{}" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("settings_policy", {
    id: { type: "smallint", primaryKey: true, default: 1 },
    defaults: { type: "jsonb", notNull: true, default: "{}" },
    locks: { type: "text[]", notNull: true, default: "{}" },
    updated_by: { type: "text" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  // Single-row table.
  pgm.addConstraint("settings_policy", "settings_policy_single_row", {
    check: "id = 1",
  });
  pgm.sql("INSERT INTO settings_policy (id) VALUES (1) ON CONFLICT DO NOTHING");
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("settings_policy");
  pgm.dropTable("user_settings");
};
