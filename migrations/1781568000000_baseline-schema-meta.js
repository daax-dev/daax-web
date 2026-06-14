/**
 * Baseline migration (brain2daax Phase 0 — issue #92).
 *
 * Creates `schema_meta`, a tiny key/value provenance table, as the first
 * reversible step in the migration history. Domain schema — the ported
 * catalog/releases tables, the F2 `built_images.sbom_json` column, and the
 * Phase 3 RBAC/identity/audit tables — lands in later migrations (#migrate,
 * Phase 3), NOT here. This baseline exists to give the history a first ordered
 * step and a verifiable up/down round-trip.
 *
 * Plain CommonJS (not TypeScript) so the production image runs migrations
 * without a TS transform step.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("schema_meta", {
    key: { type: "text", primaryKey: true },
    value: { type: "text", notNull: true },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Record the baseline marker. ON CONFLICT keeps `up` idempotent if the row
  // already exists (e.g. a partial prior run).
  pgm.sql(
    "INSERT INTO schema_meta (key, value) VALUES ('baseline', 'phase-0') ON CONFLICT (key) DO NOTHING;",
  );
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("schema_meta");
};
